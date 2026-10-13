// Keyword post search, "Top" or "Recent".
import { threads, line } from './_session.js';

const { items } = await threads.searchPosts('javascript', { recent: false }); // recent: true for "Recent" tab
for (const thread of items) console.log(line(thread.thread_items[0].post));
