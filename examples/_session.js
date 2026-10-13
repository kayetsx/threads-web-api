// Shared by the examples: load session.json (run `npm run login` first).
import { readFileSync, existsSync } from 'node:fs';
import { Threads } from '@kayetsx/threads-web-api';

if (!existsSync('session.json')) {
  console.error('session.json not found. Run `npm run login` first.');
  process.exit(1);
}
export const threads = new Threads(JSON.parse(readFileSync('session.json', 'utf8')));

// One-line summary of a post.
export const line = post =>
  `${new Date(post.taken_at * 1000).toISOString().slice(0, 16)} @${post.user.username}: ` +
  `${(post.caption?.text ?? '').replace(/\s+/g, ' ').slice(0, 70)} (${post.like_count} likes)`;
