#!/usr/bin/env node
// Live check of every read method against threads.com. Read-only: never follows, likes or posts.
// Usage: npm run smoke   (needs session.json from `npm run login`, or THREADS_COOKIES). Exit code 1 if anything fails.
import { readFileSync, existsSync } from 'node:fs';
import { Threads, simplifyPost } from '../src/index.js';

// THREADS_COOKIES (a browser cookie string) wins over session.json, so CI can use a secret.
if (!process.env.THREADS_COOKIES && !existsSync('session.json')) {
  console.error('session.json not found. Run `npm run login` first (or set THREADS_COOKIES).');
  process.exit(1);
}
const threads = new Threads(process.env.THREADS_COOKIES || JSON.parse(readFileSync('session.json', 'utf8')));
const USER = 'zuck', POST = 'https://www.threads.com/@zuck/post/DeZtp-TkQHh';

const ctx = {};
const checks = [
  ['me', async () => (await threads.me()).username],
  ['getUserProfile', async () => (ctx.user = await threads.getUserProfile(USER)).username],
  ['getUserIDfromUsername', async () => (ctx.id = await threads.getUserIDfromUsername(USER))],
  ['getUserProfileByID', async () => (await threads.getUserProfileByID(ctx.id)).username],
  ['getUserProfileThreads', async () => pages(next => threads.getUserProfileThreads(ctx.id, { after: next }))],
  ['getUserProfileReplies', async () => pages(next => threads.getUserProfileReplies(ctx.id, { after: next }))],
  ['getUserProfileMedia', async () => pages(next => threads.getUserProfileMedia(ctx.id, { after: next }))],
  ['getUserProfileReposts', async () => count((await threads.getUserProfileReposts(ctx.id)).items, 0)],
  ['reposts paging', async () => pages(async next => threads.getUserProfileReposts(ctx.mosseri ??= await threads.getUserIDfromUsername('mosseri'), { after: next, first: 5 }))],
  ['getDrafts', async () => count(await threads.getDrafts(), 0)],
  ['validateTag', async () => (await threads.validateTag('fashionthreads')).valid ? 'valid' : (() => { throw new Error('tag not valid'); })()],
  ['getUserFollowers', async () => count((await threads.getUserFollowers(ctx.id)).items)],
  ['getUserFollowing', async () => pages(next => threads.getUserFollowing(ctx.id, { after: next }))],
  ['getFeed', async () => pages(next => threads.getFeed({ after: next }))],
  ['getFollowingFeed', async () => count((await threads.getFollowingFeed()).items, 0)],
  ['getThreads', async () => simplifyPost(await threads.getThreads(POST)).code],
  ['getReplies', async () => pages(next => threads.getReplies(POST, { after: next }))],
  ['getPostLikers', async () => count(await threads.getPostLikers(POST))],
  ['getPostReposters', async () => count(await threads.getPostReposters(POST))],
  ['getPostQuotes', async () => count(await threads.getPostQuotes(POST))],
  ['searchUsers', async () => count(await threads.searchUsers(USER))],
  ['getRecommendedUsers', async () => count(await threads.getRecommendedUsers())],
  ['searchPosts', async () => count((await threads.searchPosts('threads')).items)],
  ['searchTags', async () => count((await threads.searchTags('UMKM Threads', { recent: true })).items)],
  ['getNotifications', async () => count((await threads.getNotifications()).items, 0)],
  ['doc_ids current', async () => {
    const changed = await threads.updateOperations();
    return changed.length ? `${changed.length} rotated: ${changed.map(c => c.name).join(', ')} (run npm run update-ops)` : 'all current';
  }],
];

// Fetch two pages; fails if the first page is empty or paging is broken.
async function pages(fetchPage) {
  const p1 = await fetchPage(null);
  count(p1.items);
  if (!p1.next) return `${p1.items.length} items, 1 page`;
  const p2 = await fetchPage(p1.next);
  return `${p1.items.length} + ${count(p2.items)} items, 2 pages`;
}
function count(items, min = 1) {
  if (!Array.isArray(items) || items.length < min) throw new Error(`expected at least ${min} items, got ${items?.length}`);
  return items.length;
}

let failed = 0;
const t0 = Date.now();
for (const [name, run] of checks) {
  const t = Date.now();
  try {
    const out = await run();
    console.log(`✓ ${name.padEnd(24)} ${String(out).slice(0, 70).padEnd(70)} ${Date.now() - t}ms`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name.padEnd(24)} ${e.name}: ${e.message.slice(0, 100)}`);
  }
}
console.log(`\n${checks.length - failed}/${checks.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
