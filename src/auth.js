import { createRequire } from 'node:module';
import { LoginError, RateLimitError } from './errors.js';
// libsodium-wrappers' ESM build has broken internal imports in some releases; its CJS build is reliable.
const sodium = createRequire(import.meta.url)('libsodium-wrappers');

// Meta's form checksum: "2" + sum of the token's char codes.
export const jazoest = token => '2' + [...token].reduce((s, c) => s + c.charCodeAt(0), 0);

// #PWD_BROWSER:10 — AES-256-GCM the password (aad = timestamp), seal the AES key to Meta's X25519 key.
export async function encryptPassword(password, keyId, publicKeyHex, version = '10', ts = Math.floor(Date.now() / 1000).toString()) {
  await sodium.ready;
  const key = crypto.getRandomValues(new Uint8Array(32));
  const aes = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const enc = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(12), additionalData: new TextEncoder().encode(ts) },
    aes, new TextEncoder().encode(password)));
  const sealed = sodium.crypto_box_seal(key, sodium.from_hex(publicKeyHex));
  const out = new Uint8Array(4 + sealed.length + enc.length);
  out.set([1, keyId, sealed.length & 255, sealed.length >> 8]);
  out.set(sealed, 4);
  out.set(enc.slice(-16), 4 + sealed.length);              // GCM tag first
  out.set(enc.slice(0, -16), 4 + sealed.length + 16);      // then ciphertext
  return `#PWD_BROWSER:${version}:${ts}:${Buffer.from(out).toString('base64')}`;
}

export default {
  async login(username, password) {
    const html = await this.page('/login');
    const m = re => html.match(re)?.[1];
    this.cookies.csrftoken ??= m(/"csrf_token":"([^"]+)"/);
    const keyId = Number(m(/"key_id":"(\d+)"/));
    const pub = m(/"public_key":"([0-9a-f]+)"/);
    const ver = m(/"public_key":"[0-9a-f]+","version":"(\d+)"/);
    if (!pub || !this.lsd) throw new Error('login page changed: encryption key or LSD token not found');

    const res = await this.req('/api/v1/web/accounts/login/ajax/', {
      method: 'POST',
      headers: this.headers('/login'),
      body: new URLSearchParams({
        username,
        enc_password: await encryptPassword(password, keyId, pub, ver),
        optIntoOneTap: 'false',
        queryParams: '{}',
        stopDeletionNonce: '',
        textAppStopDeletionToken: '',
        can_threads_signup_with_ig: 'false',
        jazoest: jazoest(this.lsd),
      }),
    });
    const text = await res.text();
    if (res.status === 429) throw new RateLimitError('login: rate limited (HTTP 429), wait before trying again');
    let j; try { j = JSON.parse(text); } catch { throw new LoginError(`login: HTTP ${res.status}, non-JSON response`); }
    // ponytail: 2FA / checkpoint not handled; the raw response is surfaced so you can see which one hit.
    if (!j.authenticated) {
      const why = j.two_factor_required ? '2FA required (not supported yet)'
        : j.checkpoint_url || j.message === 'checkpoint_required' ? 'checkpoint: confirm the login in the Threads/Instagram app, then retry'
        : j.user === false ? 'username not found'
        : j.user ? 'wrong password'
        : j.message || JSON.stringify(j);
      throw new LoginError(`login failed: ${why}`, { response: j });
    }
    await this.page('/'); // logged-in page carries fb_dtsg for GraphQL
    return j;
  },
};
