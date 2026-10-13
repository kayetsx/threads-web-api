// Run `npm run login` first to create session.json, then: node examples/quickstart.js
import { readFileSync } from 'node:fs';
import { Threads, getPostIDfromURL } from '@kayetsx/threads-web-api';

const threads = new Threads(JSON.parse(readFileSync('session.json', 'utf8')));

const profile = await threads.getUserProfile('zuck');
console.log(`@${profile.username}: ${profile.follower_count} followers`);

const { items } = await threads.getUserProfileThreads(profile.pk);
for (const thread of items.slice(0, 3)) {
  const post = thread.thread_items[0].post;
  console.log('-', post.caption?.text?.slice(0, 80), `(${post.like_count} likes)`);
}

const postID = getPostIDfromURL('https://www.threads.com/@zuck/post/DeZtp-TkQHh');
const replies = await threads.getReplies(postID);
console.log(`${replies.items.length} replies on first page, more: ${!!replies.next}`);
