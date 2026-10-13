// All posts of a user, page by page.
import { threads, line } from './_session.js';

const pages = 2;
const userID = await threads.getUserIDfromUsername('zuck');

let after = null;
for (let i = 1; i <= pages; i++) {
  const { items, next } = await threads.getUserProfileThreads(userID, { after });
  console.log(`--- page ${i} ---`);
  for (const thread of items) console.log(line(thread.thread_items[0].post));
  if (!(after = next)) break;
}
