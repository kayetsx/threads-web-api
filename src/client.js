import { readFileSync, writeFileSync } from 'node:fs';
import operations from './operations.json' with { type: 'json' };
import { jazoest } from './auth.js';
import { SessionExpiredError, RateLimitError, ThreadsError } from './errors.js';
import { discoverDocIds } from './discover.js';

// Relay feature flags every query expects; without them fields resolve to "execution error".
const { prefix, suffix, values } = operations.relayFlags;
const RELAY_FLAGS = Object.fromEntries(values.split(' ').map(p => {
  const [k, v] = p.split('=');
  return [prefix + k + suffix, v === '1'];
}));

const BASE = 'https://www.threads.com';
const APP_ID = '238260118697367';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const CLIENT_HINTS = {
  'accept-language': 'en-US,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="141", "Google Chrome";v="141", "Not?A_Brand";v="8"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
};
// Without these the server sends a stripped page (no password encryption key).
const NAV = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', 'sec-fetch-site': 'none', 'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

// Transport: cookies, page tokens, GraphQL. Feature methods are mixed in from src/modules (see index.js).
export class Threads {
  /**
   * @param cookies  session cookies (contents of session.json), a browser cookie string
   *                 ("sessionid=...; csrftoken=..."), or {} before login()
   * @param options  fetch: custom fetch (e.g. for a proxy); retries: rate-limit/5xx retries (default 3);
   *                 retryDelay: first backoff in ms, doubled each retry (default 2000);
   *                 autoUpdate: on "execution error", look up fresh doc_ids once and retry (default true);
   *                 minInterval: minimum ms between requests to threads.com (default 1000, 0 = off);
   *                 cacheFile: JSON file that keeps rediscovered doc_ids between runs (default: none)
   */
  constructor(cookies = {}, {
    fetch: fetchImpl = globalThis.fetch, retries = 3, retryDelay = 2000, autoUpdate = true, minInterval = 1000, cacheFile,
  } = {}) {
    this.cookies = typeof cookies === 'string'
      ? Object.fromEntries(cookies.split(';').map(c => c.trim().split(/=(.*)/s).slice(0, 2)).filter(([k]) => k))
      : cookies;
    this.fetch = fetchImpl;
    this.retries = retries;
    this.retryDelay = retryDelay;
    this.autoUpdate = autoUpdate;
    this.minInterval = minInterval;
    this.docIds = {}; // doc_ids discovered at runtime; override operations.json
    this._nextSlot = 0;
    this.cacheFile = cacheFile;
    if (cacheFile) this.loadCache();
  }

  // Saved ids only count while operations.json still has the id they replaced; a newer package wins.
  loadCache() {
    try {
      const base = Object.fromEntries(Object.entries(operations.ops).map(([k, o]) => [o.name ?? k, o.doc_id]));
      for (const { name, from, to } of JSON.parse(readFileSync(this.cacheFile, 'utf8'))) {
        if (base[name] === from) this.docIds[name] = to;
      }
    } catch { /* no cache yet, or unreadable: rediscover when needed */ }
  }

  get userId() { return this.cookies.ds_user_id; }

  // Space requests at least minInterval apart. Each caller reserves the next free slot synchronously,
  // so concurrent calls queue up instead of firing together.
  async throttle() {
    if (!this.minInterval) return;
    const now = Date.now(), slot = Math.max(now, this._nextSlot);
    this._nextSlot = slot + this.minInterval;
    if (slot > now) await new Promise(r => setTimeout(r, slot - now));
  }

  async req(path, opts = {}) {
    let url = BASE + path;
    for (let hop = 0; hop < 5; hop++) {
      await this.throttle();
      const res = await this.fetch(url, {
        ...opts, redirect: 'manual',
        headers: { 'user-agent': UA, ...CLIENT_HINTS, cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '), ...opts.headers },
      });
      for (const c of res.headers.getSetCookie()) {
        const [kv] = c.split(';'), i = kv.indexOf('=');
        const k = kv.slice(0, i).trim(), v = kv.slice(i + 1);
        if (!v || v === '""' || /expires=Thu, 01[- ]Jan[- ]1970/i.test(c)) delete this.cookies[k];
        else this.cookies[k] = v;
      }
      const loc = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !loc) return res;
      url = new URL(loc, url).href;
      opts = { ...opts, method: 'GET', body: undefined };
    }
    throw new Error('too many redirects');
  }

  // Load an HTML page and refresh the tokens Meta embeds in it.
  async page(path = '/') {
    const html = await (await this.req(path, { headers: NAV })).text();
    const m = re => html.match(re)?.[1];
    this.lsd = m(/\["LSD",\[\],\{"token":"([^"]+)"/) ?? this.lsd;
    this.dtsg = m(/\["DTSGInitialData",\[\],\{"token":"([^"]+)"/) ?? this.dtsg;
    this.rev = m(/"server_revision":(\d+)/) ?? this.rev;
    return html;
  }

  headers(referer) {
    return {
      'content-type': 'application/x-www-form-urlencoded',
      origin: BASE, referer: BASE + referer,
      'x-ig-app-id': APP_ID,
      'x-csrftoken': this.cookies.csrftoken ?? '',
      'x-fb-lsd': this.lsd ?? '',
      'x-instagram-ajax': this.rev ?? '0',
      'x-requested-with': 'XMLHttpRequest',
      accept: '*/*', 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-origin',
    };
  }

  // POST to a REST endpoint (/api/v1/…, /rupload_…). Anything but { status: 'ok' } becomes a typed error.
  // Not retried: these are writes, and a retry after a lost response could repeat them.
  async rest(name, path, { body, headers } = {}) {
    if (!this.lsd) await this.page('/');
    const res = await this.req(path, { method: 'POST', headers: { ...this.headers('/'), ...headers }, body });
    if (res.status === 429) throw new RateLimitError(`${name}: rate limited (HTTP 429)`, { status: 429 });
    let j;
    try { j = JSON.parse(await res.text()); }
    catch { throw new ThreadsError(`${name}: HTTP ${res.status}, non-JSON response`, { status: res.status }); }
    if (j.status !== 'ok') {
      const msg = `${name}: ${j.message || JSON.stringify(j)}`;
      if (j.message === 'login_required' || j.require_login) throw new SessionExpiredError(msg, { response: j });
      throw new ThreadsError(msg, { response: j, status: res.status });
    }
    return j;
  }

  // Raw GraphQL call, for any operation not wrapped in a module. Retries rate limits and 5xx with backoff.
  // relayFlags: false sends only the variables given (some mutations fail with "execution error" when
  // they get relay flags their document doesn't declare).
  async graphql(name, docId, variables = {}, path = '/graphql/query', { relayFlags = true } = {}) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.graphqlOnce(name, docId, relayFlags ? { ...RELAY_FLAGS, ...variables } : variables, path);
      } catch (e) {
        const retryable = e instanceof RateLimitError || e.status >= 500;
        if (!retryable || attempt >= this.retries) throw e;
        await new Promise(r => setTimeout(r, this.retryDelay * 2 ** attempt));
      }
    }
  }

  async graphqlOnce(name, docId, variables, path) {
    if (!this.dtsg) {
      // Share one token page load between concurrent first calls.
      this._tokenLoad ??= this.page('/').finally(() => { this._tokenLoad = null; });
      await this._tokenLoad;
      // A valid session always gets fb_dtsg on the home page; Meta also deletes a dead sessionid cookie.
      if (!this.dtsg) throw new SessionExpiredError('Not logged in or session expired. Run login again.');
    }
    const res = await this.req(path, {
      method: 'POST',
      headers: { ...this.headers('/'), 'x-fb-friendly-name': name },
      body: new URLSearchParams({
        av: this.userId, __user: '0', __a: '1', __comet_req: '29',
        fb_dtsg: this.dtsg, jazoest: jazoest(this.dtsg), lsd: this.lsd,
        fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: name,
        server_timestamps: 'true', variables: JSON.stringify(variables), doc_id: docId,
      }),
    });
    const text = await res.text();
    if (res.status === 429) throw new RateLimitError(`${name}: rate limited (HTTP 429)`, { status: 429 });
    let j;
    try { j = JSON.parse(text.replace(/^for \(;;\);/, '')); }
    catch { throw new ThreadsError(`${name}: HTTP ${res.status}, non-JSON response`, { status: res.status }); }
    if (j.errors?.length) {
      const err = j.errors[0], msg = `${name}: ${err.message}`;
      if (err.requires_reauth || !this.cookies.sessionid) throw new SessionExpiredError(msg, { response: j });
      // Meta also says "Try again later" for plain server errors (e.g. invalid_variable_type), so those don't count.
      if (!/server error/i.test(err.message) && /rate limit|too many|wait a few minutes|try again later/i.test(`${err.message} ${err.description ?? ''}`)) {
        throw new RateLimitError(msg, { response: j });
      }
      throw new ThreadsError(msg, { response: j, status: res.status });
    }
    // Some operations (mutations, count subscriptions) come double-wrapped as { data: { data: … } }.
    const keys = Object.keys(j.data ?? {});
    return keys.length === 1 && keys[0] === 'data' ? j.data.data : j.data;
  }

  /**
   * Iterate every item across pages.
   *   for await (const t of threads.paginate(after => threads.getUserProfileThreads(id, { after }))) …
   * maxPages limits requests; delay (ms) waits between pages to stay under rate limits.
   */
  async *paginate(fetchPage, { maxPages = Infinity, delay = 0 } = {}) {
    let after = null;
    for (let n = 0; n < maxPages; n++) {
      const { items, next } = await fetchPage(after);
      yield* items;
      if (!(after = next)) return;
      if (delay) await new Promise(r => setTimeout(r, delay));
    }
  }

  // Call a known operation by name; url + doc_id come from operations.json.
  // If Meta rotated the doc_id, the call fails with "execution error": look the id up again (once per
  // instance) and retry if it changed. Other causes of "execution error" are rethrown unchanged.
  async op(name, variables) {
    const o = operations.ops[name];
    // `name` overrides the key when two entries share one operation (e.g. *_byID variants).
    const opName = o.name ?? name;
    const docId = () => this.docIds[opName] ?? o.doc_id;
    const used = docId();
    try {
      return await this.graphql(opName, used, variables, o.url, o);
    } catch (e) {
      // /graphql/query says "execution error"; /api/graphql says "Exception was thrown during the execution of a query".
      if (!this.autoUpdate || !/execution error|thrown during the execution/i.test(e.message)) throw e;
      await this.updateOperations({ want: opName }).catch(() => {});
      if (docId() === used) throw e;
      return this.graphql(opName, docId(), variables, o.url, o);
    }
  }

  /**
   * Re-discover doc_ids from threads.com's scripts. Pages already scanned by this instance are skipped
   * (force: true starts over); `want` stops as soon as that operation is found.
   * Returns the operations whose doc_id differs from operations.json.
   */
  async updateOperations({ want, force = false } = {}) {
    if (force) this._discovery = undefined;
    // ponytail: two concurrent misses can scan the same page twice; harmless, just slower.
    this._discovery = await discoverDocIds(this, { want, state: this._discovery });
    Object.assign(this.docIds, this._discovery.found);
    const changed = Object.entries(operations.ops)
      .map(([key, o]) => ({ name: o.name ?? key, from: o.doc_id, to: this.docIds[o.name ?? key] }))
      .filter(c => c.to && c.to !== c.from);
    if (this.cacheFile) try { writeFileSync(this.cacheFile, JSON.stringify(changed)); } catch { /* read-only disk: skip */ }
    return changed;
  }
}

// Relay connection -> { items, next } where next is the cursor for the following page (or null).
export function page(conn, map, dropEmpty = false) {
  const items = conn.edges.map(map);
  return { items: dropEmpty ? items.filter(Boolean) : items, next: conn.page_info.has_next_page ? conn.page_info.end_cursor : null };
}
