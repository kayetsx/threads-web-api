#!/usr/bin/env node
// Live check of every write method, on your own account: posts, edits, reposts, then deletes everything
// it created (also when a step fails). Moderation runs mute/restrict and their undo on a target you name.
// Usage: npm run smoke:write [-- --video clip.mp4] [-- --target username]   (needs session.json)
// Exit code 1 if anything fails.
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Threads, NotFoundError } from '../src/index.js';

if (!existsSync('session.json')) {
  console.error('session.json not found. Run `npm run login` first.');
  process.exit(1);
}
const { values: args } = parseArgs({ options: { video: { type: 'string' }, target: { type: 'string' } } });
const threads = new Threads(JSON.parse(readFileSync('session.json', 'utf8')));
// 320x320 solid blue JPEG, so the check needs no files.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYzLjUuMTAwAP/bAEMACBAQExATFhYWFhYWGhgaGxsbGhoaGhsbGx0dHSIiIh0dHRsbHR0gICIiJSYlIyMiIyYmKCgoMDAuLjg4OkVFU//EAEwAAQEAAAAAAAAAAAAAAAAAAAAFAQEBAAAAAAAAAAAAAAAAAAAABhABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAUABQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AIIC7TgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD//Z', 'base64');

const made = [];
const keep = m => { made.push(m.pk); return m; };
const me = await threads.me();
let base;

const checks = [
  ['publish text', async () => (base = keep(await threads.publish(`smoke test @${me.username}`, { topic: 'Testing', replyControl: 'following' }))).code],
  ['publish poll', async () => keep(await threads.publish('smoke test poll', { poll: ['Yes', 'No'] })).code],
  ['publish photo + alt', async () => keep(await threads.publish('smoke test photo', { image: JPEG, alt: 'blue square' })).code],
  ['publish carousel', async () => keep(await threads.publish('smoke test carousel', { image: [JPEG, JPEG] })).code],
  ['publish link', async () => keep(await threads.publish('smoke test link', { link: 'https://github.com' })).code],
  ['publish reply', async () => keep(await threads.publish('smoke test reply', { replyTo: base.pk })).code],
  ['publish quote', async () => keep(await threads.publish('smoke test quote', { quote: base.pk })).code],
  ['publishThread', async () => (await threads.publishThread(['smoke test 1/2', 'smoke test 2/2'])).map(m => keep(m).code).join(' -> ')],
  ...(args.video ? [['publish video', async () => keep(await threads.publish('smoke test video', { video: args.video })).code]] : []),
  ['publish photo+video', async () => keep(await threads.publish('smoke test mixed carousel', { media: [JPEG, ...(args.video ? [args.video] : [JPEG])] })).code],
  ['schedule + cancel', async () => {
    const s = await threads.schedulePost('smoke test scheduled', { at: Date.now() + 7 * 86400e3, image: JPEG });
    const listed = (await threads.getScheduledPosts()).some(p => p.id === s.id);
    const { deleted } = await threads.cancelScheduledPost(s.id);
    if (!listed || !deleted) throw new Error(`listed=${listed} deleted=${deleted}`);
    return `${s.id} listed, cancelled`;
  }],
  ['editPost', async () => (await threads.editPost(base.pk, 'smoke test (edited)')).caption.text],
  ['repost', async () => JSON.stringify(await threads.repost(base.pk))],
  ['deleteRepost', async () => JSON.stringify(await threads.deleteRepost(base.pk))],
  ...(args.target ? [
    ['mute / unmute', async () => `${JSON.stringify(await threads.mute(args.target))} ${JSON.stringify(await threads.unmute(args.target))}`],
    ['restrict / unrestrict', async () => `${JSON.stringify(await threads.restrict(args.target))} ${JSON.stringify(await threads.unrestrict(args.target))}`],
  ] : []),
];

let failed = 0;
const t0 = Date.now();
const run = async (name, fn) => {
  const t = Date.now();
  try {
    console.log(`✓ ${name.padEnd(24)} ${String(await fn()).slice(0, 60).padEnd(60)} ${Date.now() - t}ms`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name.padEnd(24)} ${e.name}: ${e.message.slice(0, 100)}`);
  }
};
try {
  for (const [name, fn] of checks) await run(name, fn);
} finally {
  // Newest first, so replies go before the posts they reply to.
  for (const pk of made.reverse()) {
    await run(`deletePost ${pk}`, async () => {
      const r = await threads.deletePost(pk);
      if (r.did_delete) return JSON.stringify(r);
      // Meta sometimes answers did_delete: false (seen for video posts) although the post is removed.
      const gone = await threads.getThreads(pk).then(() => false, e => e instanceof NotFoundError);
      if (!gone) throw new Error('post still exists');
      return 'did_delete: false, but the post is gone';
    });
  }
}
console.log(`\n${checks.length + made.length - failed}/${checks.length + made.length} passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed ? 1 : 0);
