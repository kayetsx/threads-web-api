// Your "For you" feed.
import { threads, line } from './_session.js';

const pages = 1;

let after = null;
for (let i = 1; i <= pages; i++) {
  const { items, next } = await threads.getFeed({ after });
  for (const thread of items) console.log(line(thread.thread_items[0].post));
  if (!(after = next)) break;
}
