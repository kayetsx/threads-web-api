// A post and its replies, from a post URL.
import { getPostIDfromURL } from '@kayetsx/threads-web-api';
import { threads, line } from './_session.js';

const pages = 1;
const postID = getPostIDfromURL('https://www.threads.com/@zuck/post/DeZtp-TkQHh');

const post = await threads.getThreads(postID);
console.log('POST  ', line(post));
console.log(`        ${post.text_post_app_info?.direct_reply_count ?? '?'} replies\n`);

let after = null;
for (let i = 1; i <= pages; i++) {
  const { items, next } = await threads.getReplies(postID, { after });
  // Each item is a reply chain: [directReply, ...replies nested under it].
  for (const [reply, ...followUps] of items) {
    console.log('REPLY ', line(reply));
    for (const f of followUps) console.log('  ↳   ', line(f));
  }
  if (!(after = next)) break;
}
