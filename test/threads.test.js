// Offline tests: no network, no account needed.
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { Threads, encryptPassword, jazoest, getPostIDfromURL } from '../src/index.js';

const sodium = createRequire(import.meta.url)('libsodium-wrappers');

test('getPostIDfromURL decodes shortcodes (real pair from threads.com)', () => {
  assert.equal(getPostIDfromURL('https://www.threads.com/@zuck/post/DeZtp-TkQHh'), '4006434140014576097');
  assert.equal(getPostIDfromURL('DeZtp-TkQHh'), '4006434140014576097');
});

test('jazoest is "2" + sum of char codes', () => {
  assert.equal(jazoest('ab'), '2195');
});

test('encryptPassword round-trips with a local keypair', async () => {
  await sodium.ready;
  const kp = sodium.crypto_box_keypair();
  const s = await encryptPassword('hunter2-ü', 215, sodium.to_hex(kp.publicKey), '10', '1700000000');
  const [tag, ver, ts, b64] = s.split(':');
  assert.equal(tag, '#PWD_BROWSER');
  assert.equal(ver, '10');
  const buf = Buffer.from(b64, 'base64');
  assert.equal(buf[0], 1);
  assert.equal(buf[1], 215);
  const len = buf[2] | (buf[3] << 8);
  assert.equal(len, 80); // 32-byte key + 48 sealed-box overhead
  const key = sodium.crypto_box_seal_open(buf.subarray(4, 4 + len), kp.publicKey, kp.privateKey);
  const gcmTag = buf.subarray(4 + len, 20 + len), ct = buf.subarray(20 + len);
  const aes = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(12), additionalData: new TextEncoder().encode(ts) }, aes, Buffer.concat([ct, gcmTag]));
  assert.equal(new TextDecoder().decode(pt), 'hunter2-ü');
});

test('all module methods are mounted on Threads', () => {
  for (const m of ['login', 'getUserProfile', 'getUserIDfromUsername', 'getUserProfileThreads', 'getUserProfileReplies', 'getUserProfileMedia', 'getUserProfileReposts', 'getFeed', 'getFollowingFeed', 'getUserProfileByID', 'me', 'getUserFollowers', 'getUserFollowing', 'getPostLikers', 'getPostReposters', 'getPostQuotes', 'getNotifications',
    'getThreads', 'getReplies', 'searchUsers', 'searchPosts', 'searchTags', 'follow', 'unfollow', 'like', 'unlike', 'graphql',
    'publish', 'publishToTag', 'publishThread', 'schedulePost', 'getScheduledPosts', 'cancelScheduledPost', 'editPost', 'deletePost', 'repost', 'deleteRepost',
    'block', 'unblock', 'mute', 'unmute', 'restrict', 'unrestrict', 'getRecommendedUsers', 'rest', 'op', 'paginate', 'updateOperations', 'validateTag', 'getDrafts', 'saveDraft', 'deleteDraft']) {
    assert.equal(typeof Threads.prototype[m], 'function', m);
  }
});
