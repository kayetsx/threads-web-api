// Offline: a fake fetch stands in for threads.com.
import { test } from 'node:test';
import assert from 'node:assert';
import { Threads, simplifyPost, simplifyUser, SessionExpiredError, RateLimitError, NotFoundError } from '../src/index.js';

const HOME = '["DTSGInitialData",[],{"token":"dtsg"}] ["LSD",[],{"token":"lsd"}] "server_revision":1';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Serves the home page for GETs and the given responses, in order, for POSTs.
function fakeFetch(...posts) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, method: opts.method ?? 'GET' });
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME, { status: 200 });
    return posts.shift() ?? json({ data: {} });
  };
  fn.calls = calls;
  return fn;
}

const session = { sessionid: 's', ds_user_id: '1', csrftoken: 'c' };

// Fake-server tests don't need pacing; the pacing test sets it explicitly.
const T = (cookies, opts = {}) => new Threads(cookies, { minInterval: 0, ...opts });

test('graphql retries a 429 and then succeeds', async () => {
  const f = fakeFetch(json({}, 429), json({ data: { ok: true } }));
  const t = T({ ...session }, { fetch: f, retryDelay: 1 });
  assert.deepEqual(await t.graphql('Q', '1'), { ok: true });
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 2);
});

test('graphql gives up with RateLimitError after retries', async () => {
  const t = T({ ...session }, { fetch: fakeFetch(json({}, 429), json({}, 429)), retries: 1, retryDelay: 1 });
  await assert.rejects(t.graphql('Q', '1'), RateLimitError);
});

test('rate-limit message in GraphQL errors is a RateLimitError', async () => {
  const t = T({ ...session }, { fetch: fakeFetch(json({ errors: [{ message: 'Please wait a few minutes before you try again.' }] })), retries: 0 });
  await assert.rejects(t.graphql('Q', '1'), RateLimitError);
});

test('missing fb_dtsg on the home page means SessionExpiredError', async () => {
  const f = async () => new Response('<html>logged out</html>', { status: 200 });
  await assert.rejects(T({ ...session }, { fetch: f }).graphql('Q', '1'), SessionExpiredError);
});

test('requires_reauth is a SessionExpiredError', async () => {
  const t = T({ ...session }, { fetch: fakeFetch(json({ errors: [{ message: 'x', requires_reauth: true }] })) });
  await assert.rejects(t.graphql('Q', '1'), SessionExpiredError);
});

test('double-wrapped { data: { data } } is unwrapped', async () => {
  const t = T({ ...session }, { fetch: fakeFetch(json({ data: { data: { user: 1 } } })) });
  assert.deepEqual(await t.graphql('Q', '1'), { user: 1 });
});

test('unknown user is a NotFoundError', async () => {
  const t = T({ ...session }, { fetch: fakeFetch(json({ data: { user: null } })) });
  await assert.rejects(t.getUserProfile('nobody'), NotFoundError);
});

test('a rotated doc_id is rediscovered from the scripts and retried', async () => {
  const SCRIPT = 'https://static.cdninstagram.com/rsrc.php/v4/x/r/abc.js';
  const posted = [];
  const f = async (url, opts) => {
    if (url === SCRIPT) return new Response('__d("BarcelonaUsernameHovercardImplDirectQuery_threadsRelayOperation",[],(function(t,n,r,o,a,i){a.exports="999"}),null);');
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME + ` <script src="${SCRIPT}"></script>`);
    const docId = new URLSearchParams(opts.body).get('doc_id');
    posted.push(docId);
    return docId === '999' ? json({ data: { user: { pk: '1' } } }) : json({ errors: [{ message: 'execution error' }] });
  };
  const t = T({ ...session }, { fetch: f });
  assert.equal((await t.getUserProfile('zuck')).pk, '1');
  assert.deepEqual(posted, ['28550444331289839', '999']);
  // Discovery happens once per instance; later calls use the new id directly.
  await t.getUserProfile('zuck');
  assert.deepEqual(posted.slice(2), ['999']);
});

test('execution error with an unchanged doc_id is rethrown, not retried', async () => {
  let posts = 0;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    posts++;
    return json({ errors: [{ message: 'execution error' }] });
  };
  await assert.rejects(T({ ...session }, { fetch: f }).getUserProfile('zuck'), /execution error/);
  assert.equal(posts, 1);
});

test('autoUpdate: false skips discovery', async () => {
  let gets = 0;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') { gets++; return new Response(HOME); }
    return json({ errors: [{ message: 'execution error' }] });
  };
  await assert.rejects(T({ ...session }, { fetch: f, autoUpdate: false }).getUserProfile('zuck'), /execution error/);
  assert.equal(gets, 1); // only the initial token page, no discovery scan
});

test('minInterval spaces out concurrent requests', async () => {
  const times = [];
  const f = async () => { times.push(Date.now()); return new Response(HOME); };
  const t = new Threads({ ...session }, { fetch: f, minInterval: 50 });
  await Promise.all([t.req('/'), t.req('/'), t.req('/')]);
  const gaps = times.slice(1).map((x, i) => x - times[i]);
  assert.ok(gaps.every(g => g >= 45), `gaps ${gaps}`);
});

test('concurrent first calls load the token page once', async () => {
  const f = fakeFetch(json({ data: { a: 1 } }), json({ data: { a: 2 } }), json({ data: { a: 3 } }));
  const t = T({ ...session }, { fetch: f });
  await Promise.all([t.graphql('Q', '1'), t.graphql('Q', '1'), t.graphql('Q', '1')]);
  assert.equal(f.calls.filter(c => c.method === 'GET').length, 1);
});

test('paginate follows cursors and respects maxPages', async () => {
  const pages = { null: { items: [1, 2], next: 'a' }, a: { items: [3], next: 'b' }, b: { items: [4], next: null } };
  const t = new Threads();
  const all = [];
  for await (const x of t.paginate(after => pages[after])) all.push(x);
  assert.deepEqual(all, [1, 2, 3, 4]);
  const two = [];
  for await (const x of t.paginate(after => pages[after], { maxPages: 2 })) two.push(x);
  assert.deepEqual(two, [1, 2, 3]);
});

test('simplifyPost maps the common fields', () => {
  const s = simplifyPost({
    pk: '9', code: 'AB', caption: { text: 'hi' }, taken_at: 1700000000, like_count: 5, media_type: 8,
    user: { pk: '1', username: 'u', is_verified: true },
    carousel_media: [{ image_versions2: { candidates: [{ url: 'i' }] } }, { video_versions: [{ url: 'v' }] }],
    text_post_app_info: { direct_reply_count: 2, repost_count: 3, quote_count: 4, reshare_count: 1 },
  });
  assert.equal(s.url, 'https://www.threads.com/@u/post/AB');
  assert.equal(s.type, 'carousel');
  assert.deepEqual(s.media.map(m => m.type), ['image', 'video']);
  assert.deepEqual([s.likes, s.replies, s.reposts, s.quotes, s.shares], [5, 2, 3, 4, 1]);
  assert.equal(s.createdAt, '2023-11-14T22:13:20.000Z');
});

test('publish posts a reply to configure_text_only_post and returns the media', async () => {
  let sent;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    sent = { url, body: new URLSearchParams(opts.body) };
    return json({ status: 'ok', media: { pk: '5', code: 'X' } });
  };
  const media = await T({ ...session }, { fetch: f }).publish('hi', { replyTo: 'DeZtp-TkQHh' });
  assert.equal(media.code, 'X');
  assert.match(sent.url, /\/api\/v1\/media\/configure_text_only_post\/$/);
  assert.equal(sent.body.get('caption'), 'hi');
  assert.equal(sent.body.get('barcelona_source_reply_id'), '4006434140014576097');
  const info = JSON.parse(sent.body.get('text_post_app_info'));
  assert.equal(info.reply_id, '4006434140014576097');
  assert.deepEqual(info.text_with_entities, { entities: [], text: 'hi' });
});

test('publish failure is a ThreadsError with the response', async () => {
  const f = async (url, opts) => (opts.method ?? 'GET') === 'GET' ? new Response(HOME) : json({ status: 'fail', message: 'nope' }, 400);
  await assert.rejects(T({ ...session }, { fetch: f }).publish('hi'), e => e.message === 'publish: nope' && e.response.status === 'fail');
});

// Minimal headers: enough bytes for imageInfo, not decodable images.
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.from([0, 0, 2, 0, 0, 0, 1, 0x2c]), Buffer.alloc(8)]);
const JPEG = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb00040000ffc2001108012c020003012200', 'hex');

test('mediaInfo reads PNG, JPEG, WebP and MP4 sizes', async () => {
  const { mediaInfo } = await import('../src/modules/content.js');
  assert.deepEqual(mediaInfo(PNG), { kind: 'image', type: 'image/png', width: 512, height: 300 });
  assert.deepEqual(mediaInfo(JPEG), { kind: 'image', type: 'image/jpeg', width: 512, height: 300 });
  // VP8X header: canvas 800x600 stored as width-1 / height-1 in 24 bits.
  const WEBP = Buffer.concat([Buffer.from('RIFF    WEBPVP8X', 'latin1'), Buffer.alloc(8), Buffer.from([0x1f, 0x03, 0, 0x57, 0x02, 0])]);
  assert.deepEqual(mediaInfo(WEBP), { kind: 'image', type: 'image/webp', width: 800, height: 600 });
  // ftyp + a version-0 tkhd with width 720, height 1280 (16.16 fixed point).
  const tkhd = Buffer.alloc(4 + 84); tkhd.write('tkhd', 0, 'latin1'); tkhd.writeUInt32BE(720 << 16, 80); tkhd.writeUInt32BE(1280 << 16, 84);
  const MP4 = Buffer.concat([Buffer.from('   ftypisom', 'latin1'), Buffer.alloc(12), tkhd]);
  assert.deepEqual(mediaInfo(MP4), { kind: 'video', type: 'video/mp4', width: 720, height: 1280 });
  assert.throws(() => mediaInfo(Buffer.from('GIF89a')), TypeError);
});

test('publish with image uploads to rupload, then configures with its upload_id', async () => {
  const sent = [];
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    sent.push({ url, opts });
    return url.includes('/rupload_igphoto/')
      ? json({ status: 'ok', upload_id: 'U1' })
      : json({ status: 'ok', media: { code: 'P' } });
  };
  const media = await T({ ...session }, { fetch: f }).publish('', { image: PNG });
  assert.equal(media.code, 'P');
  const [up, conf] = sent;
  assert.match(up.url, /\/rupload_igphoto\/fb_uploader_\d+$/);
  assert.equal(up.opts.headers['x-entity-type'], 'image/png');
  assert.equal(up.opts.headers['x-entity-length'], String(PNG.length));
  assert.equal(JSON.parse(up.opts.headers['x-instagram-rupload-params']).upload_media_width, 512);
  assert.match(conf.url, /\/configure_text_post_app_feed\/$/);
  const body = new URLSearchParams(conf.opts.body);
  assert.equal(body.get('upload_id'), 'U1');
  assert.equal(body.get('publish_mode'), null);
});

test('publish validates its options before uploading anything', async () => {
  await assert.rejects(T({ ...session }).publish(''), TypeError);
  await assert.rejects(T({ ...session }).publish('x', { poll: ['a', 'b'], image: PNG }), /text-only/);
  await assert.rejects(T({ ...session }).publish('x', { replyControl: 'friends' }), /replyControl/);
});

test('publish sends poll, topic and named replyControl', async () => {
  let body;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    body = new URLSearchParams(opts.body);
    return json({ status: 'ok', media: { code: 'X' } });
  };
  await T({ ...session }, { fetch: f }).publish('Tabs?', { poll: ['Yes', 'No'], topic: 'JavaScript', replyControl: 'following' });
  assert.deepEqual(JSON.parse(body.get('caption_add_on')), { poll: { question: '?', tallies: [{ text: 'Yes' }, { text: 'No' }] } });
  const info = JSON.parse(body.get('text_post_app_info'));
  assert.deepEqual(info.tag_header, { display_text: 'JavaScript' });
  assert.equal(info.reply_control, 1);
});

test('publishThread chains each post as a reply to the previous one', async () => {
  const replies = [];
  let n = 0;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    replies.push(new URLSearchParams(opts.body).get('barcelona_source_reply_id'));
    return json({ status: 'ok', media: { pk: String(++n) } });
  };
  const posts = await T({ ...session }, { fetch: f }).publishThread(['one', { text: 'two' }, 'three']);
  assert.deepEqual(posts.map(p => p.pk), ['1', '2', '3']);
  assert.deepEqual(replies, [null, '1', '2']);
});

test('discovery also reads mutation ids inlined in .graphql modules', async () => {
  const SCRIPT = 'https://static.cdninstagram.com/rsrc.php/v4/y/r/m.js';
  const f = async (url, opts) => {
    if (url === SCRIPT) return new Response('__d("useTHUserBlockMutation.threads.graphql",[],(function(){var e={params:{id:"777",metadata:{},name:"useTHUserBlockMutation",operationKind:"mutation",text:null}}}));');
    return new Response(HOME + ` <script src="${SCRIPT}"></script>`);
  };
  const t = T({ ...session }, { fetch: f });
  const changed = await t.updateOperations({ want: 'useTHUserBlockMutation' });
  assert.deepEqual(changed.find(c => c.name === 'useTHUserBlockMutation'), { name: 'useTHUserBlockMutation', from: '26803837702651619', to: '777' });
});

test('restrict posts the user id to the REST endpoint', async () => {
  let sent;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    sent = { url, body: new URLSearchParams(opts.body) };
    return json({ status: 'ok' });
  };
  await T({ ...session }, { fetch: f }).restrict('123');
  assert.match(sent.url, /\/api\/v1\/web\/restrict_action\/restrict\/$/);
  assert.equal(sent.body.get('target_user_id'), '123');
});

test('publish with several images uploads each as sidecar and posts a JSON carousel', async () => {
  const sent = [];
  let n = 0;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    sent.push({ url, opts });
    return url.includes('/rupload_igphoto/') ? json({ status: 'ok', upload_id: `U${++n}` }) : json({ status: 'ok', media: { code: 'C' } });
  };
  const media = await T({ ...session }, { fetch: f }).publish('two', { image: [PNG, JPEG], link: 'https://example.com' });
  assert.equal(media.code, 'C');
  assert.equal(JSON.parse(sent[0].opts.headers['x-instagram-rupload-params']).is_sidecar, '1');
  const conf = sent[2];
  assert.match(conf.url, /\/configure_text_post_app_sidecar\/$/);
  assert.equal(conf.opts.headers['content-type'], 'text/plain;charset=UTF-8');
  const body = JSON.parse(conf.opts.body);
  assert.deepEqual(body.children_metadata, [{ upload_id: 'U1' }, { upload_id: 'U2' }]);
  assert.equal(JSON.parse(body.text_post_app_info).link_attachment_url, 'https://example.com');
});

test('editPost sends only its own relay flags and the reply-control enum name', async () => {
  let vars, docId;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    const p = new URLSearchParams(opts.body);
    vars = JSON.parse(p.get('variables')); docId = p.get('doc_id');
    assert.match(url, /\/graphql\/query$/);
    return json({ data: { record: { media: { code: 'E' } } } });
  };
  const media = await T({ ...session }, { fetch: f }).editPost('123', 'new text', { replyControl: 'following' });
  assert.equal(media.code, 'E');
  assert.equal(docId, '38972628115683709');
  assert.equal(vars.replyControl, 'accounts_you_follow');
  assert.deepEqual(Object.keys(vars).filter(k => k.startsWith('__relay')).length, 2);
});

test('a server error saying "Try again later" is not a rate limit', async () => {
  const err = { message: 'A server error invalid_variable_type occured.', description: 'There was a problem with this request. Try again later.' };
  const t = T({ ...session }, { fetch: fakeFetch(json({ errors: [err] })), retries: 0 });
  await assert.rejects(t.graphql('Q', '1'), e => e.name === 'ThreadsError');
});

// GraphQL fake: answers by operation name; records variables per call.
function gqlFetch(answers) {
  const calls = [];
  const fn = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    if (url.includes('/rupload_')) { calls.push({ name: 'upload', url, headers: opts.headers }); return json({ status: 'ok', upload_id: 'U' + calls.length }); }
    const p = new URLSearchParams(opts.body);
    const name = p.get('fb_api_req_friendly_name');
    calls.push({ name, vars: JSON.parse(p.get('variables')) });
    return json({ data: typeof answers[name] === 'function' ? answers[name]() : answers[name] });
  };
  fn.calls = calls;
  return fn;
}

test('schedulePost creates a draft, then schedules it at the given time', async () => {
  const f = gqlFetch({
    useTHDraftCreateMutationMutation: { xth_create_draft_thread: { draft_thread: { id: 'D1' } } },
    useTHSchedulePostMutationMutation: { xdt_text_app_schedule_draft: { success: true, schedule_publish_status: 'SCHEDULED', schedule_publish_time: 2000000000 } },
  });
  const at = new Date(2000000000 * 1000);
  const r = await T({ ...session }, { fetch: f }).schedulePost('later', { at, image: PNG, alt: 'a pic', topic: 'Testing', poll: undefined, replyControl: 'mentioned' });
  assert.deepEqual(r, { id: 'D1', scheduled_time: 2000000000 });
  const [up, draft, sched] = f.calls;
  assert.equal(up.name, 'upload');
  const item = draft.vars.draft_thread_items[0];
  assert.equal(item.text, 'later');
  assert.deepEqual(item.attachment_upload_ids, ['U1']);
  assert.deepEqual(item.custom_accessibility_caption, { media_custom_accessibility_captions_by_attachment: [{ attachment_upload_id: 'U1', caption: 'a pic' }] });
  assert.deepEqual(item.tag_header, { display_text: 'Testing' });
  assert.equal(draft.vars.reply_control, 'MENTIONED_ONLY');
  assert.equal(Object.keys(draft.vars).some(k => k.startsWith('__relay')), false);
  assert.deepEqual(sched.vars.input, { client_mutation_id: '1', draft_id: 'D1', schedule_publish_state: 'SCHEDULED', schedule_publish_time: 2000000000 });
});

test('schedulePost deletes the draft when scheduling fails, and validates its options', async () => {
  const f = gqlFetch({
    useTHDraftCreateMutationMutation: { xth_create_draft_thread: { draft_thread: { id: 'D2' } } },
    useTHSchedulePostMutationMutation: { xdt_text_app_schedule_draft: { success: false } },
    useBarcelonaDraftDeleteMutationMutation: { record: { deleted_id: 'D2' } },
  });
  const t = T({ ...session }, { fetch: f });
  await assert.rejects(t.schedulePost('x', { at: Date.now() + 3600e3 }), /did not confirm/);
  assert.deepEqual(f.calls.at(-1), { name: 'useBarcelonaDraftDeleteMutationMutation', vars: { draft_thread_id: 'D2' } });
  await assert.rejects(t.schedulePost('x', { at: Date.now() - 1000 }), /future/);
  await assert.rejects(t.schedulePost('x', { at: Date.now() + 3600e3, quote: '1' }), /not supported/);
});

test('getScheduledPosts keeps scheduled drafts only, soonest first', async () => {
  const node = (id, status, time, text) => ({ id, schedule_publish_status: status, schedule_publish_time: time, draft_thread_items: { nodes: [{ text }] } });
  const f = gqlFetch({ BarcelonaComposerDraftsDialogDraftsQuery: { xth_threads_viewer: { drafts: { nodes: [node('a', 'SCHEDULED', 300, 'late'), node('b', null, null, 'plain draft'), node('c', 'SCHEDULED', 100, 'soon')] } } } });
  const list = await T({ ...session }, { fetch: f }).getScheduledPosts();
  assert.deepEqual(list.map(p => [p.id, p.scheduled_time, p.text]), [['c', 100, 'soon'], ['a', 300, 'late']]);
});

test('publish media: mixed photos and videos keep their order in a carousel', async () => {
  const tkhd = Buffer.alloc(4 + 84); tkhd.write('tkhd', 0, 'latin1'); tkhd.writeUInt32BE(720 << 16, 80); tkhd.writeUInt32BE(1280 << 16, 84);
  const MP4 = Buffer.concat([Buffer.from('\0\0\0\x18ftypisom', 'latin1'), Buffer.alloc(12), tkhd]);
  const sent = [];
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    sent.push(url);
    if (url.includes('/rupload_igvideo/')) return json({ status: 'ok', media_id: 1 });
    if (url.includes('/rupload_igphoto/')) return json({ status: 'ok', upload_id: 'P' });
    return json({ status: 'ok', media: { code: 'M' } });
  };
  await T({ ...session }, { fetch: f }).publish('', { media: [MP4, PNG] });
  assert.match(sent[0], /rupload_igvideo/);
  assert.match(sent[1], /rupload_igphoto/);
  assert.match(sent[2], /configure_text_post_app_sidecar/);
});

test('constructor accepts a browser cookie string', () => {
  const t = T('sessionid=s%3Ax=y; csrftoken=c;ds_user_id=1; ');
  assert.deepEqual(t.cookies, { sessionid: 's%3Ax=y', csrftoken: 'c', ds_user_id: '1' });
  assert.equal(t.userId, '1');
});

test('publishToTag sends the tag as the topic, without a leading #', async () => {
  let body;
  const f = async (url, opts) => {
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME);
    body = new URLSearchParams(opts.body);
    return json({ status: 'ok', media: { code: 'T' } });
  };
  await T({ ...session }, { fetch: f }).publishToTag('#fashionthreads', 'OOTD');
  assert.deepEqual(JSON.parse(body.get('text_post_app_info')).tag_header, { display_text: 'fashionthreads' });
});

test('simplifyUser maps profile fields and tolerates thin user objects', () => {
  const u = simplifyUser({ pk: '1', username: 'u', full_name: 'U', is_verified: true, biography: 'hi', follower_count: 7,
    text_post_app_is_private: true, profile_pic_url: 'small', hd_profile_pic_versions: [{ url: 'mid' }, { url: 'big' }] });
  assert.deepEqual(u, { id: '1', username: 'u', fullName: 'U', verified: true, private: true, bio: 'hi', followers: 7, avatar: 'big' });
  assert.deepEqual(simplifyUser({ pk: '2', username: 'v' }), { id: '2', username: 'v', fullName: null, verified: false, private: false, bio: '', followers: null, avatar: null });
});

test('cacheFile keeps a rediscovered doc_id for the next instance, and ignores it once operations.json moved on', async () => {
  const { mkdtempSync, readFileSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(tmpdir() + '/threads-cache-'), cacheFile = dir + '/ids.json';
  const SCRIPT = 'https://static.cdninstagram.com/rsrc.php/v4/x/r/abc.js';
  const posted = [];
  const f = async (url, opts) => {
    if (url === SCRIPT) return new Response('__d("BarcelonaUsernameHovercardImplDirectQuery_threadsRelayOperation",[],(function(t,n,r,o,a,i){a.exports="999"}),null);');
    if ((opts.method ?? 'GET') === 'GET') return new Response(HOME + ` <script src="${SCRIPT}"></script>`);
    const docId = new URLSearchParams(opts.body).get('doc_id');
    posted.push(docId);
    return docId === '999' ? json({ data: { user: { pk: '1' } } }) : json({ errors: [{ message: 'execution error' }] });
  };
  try {
    await T({ ...session }, { fetch: f, cacheFile }).getUserProfile('zuck');
    assert.equal(JSON.parse(readFileSync(cacheFile, 'utf8')).find(c => c.name === 'BarcelonaUsernameHovercardImplDirectQuery').to, '999');
    posted.length = 0;
    await T({ ...session }, { fetch: f, cacheFile }).getUserProfile('zuck');
    assert.deepEqual(posted, ['999']); // straight to the cached id, no failed first try
    // A cache entry whose `from` no longer matches operations.json is stale and skipped.
    writeFileSync(cacheFile, JSON.stringify([{ name: 'BarcelonaUsernameHovercardImplDirectQuery', from: 'old', to: '555' }]));
    assert.deepEqual(T({}, { cacheFile }).docIds, {});
    assert.deepEqual(T({}, { cacheFile: dir + '/missing.json' }).docIds, {});
  } finally { rmSync(dir, { recursive: true }); }
});

test('profile reposts page 2 goes through the refetch query with the cursor', async () => {
  const conn = (cursor, more) => ({ mediaData: { edges: [{ node: { id: cursor } }], page_info: { has_next_page: more, end_cursor: cursor } } });
  const f = gqlFetch({ BarcelonaProfileRepostsTabDirectQuery: conn('c1', true), BarcelonaProfileRepostsTabRefetchableDirectQuery: conn('c2', false) });
  const t = T({ ...session }, { fetch: f });
  const p1 = await t.getUserProfileReposts('7');
  assert.equal(p1.next, 'c1');
  const p2 = await t.getUserProfileReposts('7', { after: p1.next });
  assert.deepEqual(p2, { items: [{ id: 'c2' }], next: null });
  assert.equal(f.calls.at(-1).vars.after, 'c1');
});

test('validateTag strips # and maps the validate result', async () => {
  const f = gqlFetch({ BarcelonaTagsUtilsQuery: { xdt_text_app_tags_validate: { is_valid: true, is_sensitive: false } } });
  assert.deepEqual(await T({ ...session }, { fetch: f }).validateTag('#fashionthreads'), { valid: true, sensitive: false });
  assert.equal(f.calls.at(-1).vars.tag_name, 'fashionthreads');
});

test('saveDraft stores a draft without scheduling; getDrafts lists plain and scheduled ones; deleteDraft removes', async () => {
  const node = (id, status, time, text) => ({ id, schedule_publish_status: status, schedule_publish_time: time, draft_thread_items: { nodes: [{ text }] } });
  const f = gqlFetch({
    useTHDraftCreateMutationMutation: { xth_create_draft_thread: { draft_thread: { id: 'D9' } } },
    BarcelonaComposerDraftsDialogDraftsQuery: { xth_threads_viewer: { drafts: { nodes: [node('D9', null, null, 'plain'), node('S1', 'SCHEDULED', 100, 'soon')] } } },
    useBarcelonaDraftDeleteMutationMutation: { record: { deleted_id: 'D9' } },
  });
  const t = T({ ...session }, { fetch: f });
  assert.deepEqual(await t.saveDraft('plain', { topic: 'JavaScript' }), { id: 'D9' });
  assert.equal(f.calls.some(c => c.name === 'useTHSchedulePostMutationMutation'), false);
  assert.deepEqual((await t.getDrafts()).map(d => [d.id, d.scheduled_time]), [['D9', null], ['S1', 100]]);
  assert.deepEqual((await t.getScheduledPosts()).map(d => d.id), ['S1']);
  assert.deepEqual(await t.deleteDraft('D9'), { deleted: true });
});
