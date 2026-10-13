// Same as https://www.threads.com/search?q=UMKM%20Threads&serp_type=tags&tag_id=18401683369128876
import { threads, line } from './_session.js';

const tag = 'UMKM Threads';
const pages = 2;
const tagID = null; // optional, e.g. '18401683369128876'

let after = null;
for (let i = 1; i <= pages; i++) {
  const { items, next } = await threads.searchTags(tag, { tagID, recent: true, after });
  for (const thread of items) console.log(line(thread.thread_items[0].post));
  if (!(after = next)) break;
}
