// Save a user's posts to a JSON file (simplified fields).
import { writeFileSync } from 'node:fs';
import { threads } from './_session.js';

const username = 'zuck';
const max = 50;
const userID = await threads.getUserIDfromUsername(username);

const posts = [];
let after = null;
do {
  const res = await threads.getUserProfileThreads(userID, { after });
  for (const thread of res.items) {
    const p = thread.thread_items[0].post;
    posts.push({
      id: p.pk,
      url: `https://www.threads.com/@${p.user.username}/post/${p.code}`,
      text: p.caption?.text ?? '',
      likes: p.like_count,
      replies: p.text_post_app_info?.direct_reply_count,
      createdAt: new Date(p.taken_at * 1000).toISOString(),
      images: (p.carousel_media ?? [p]).map(m => m.image_versions2?.candidates?.[0]?.url).filter(Boolean),
    });
  }
  after = res.next;
  await new Promise(r => setTimeout(r, 1000)); // be gentle: 1 request/second
} while (after && posts.length < max);

const file = `${username}-posts.json`;
writeFileSync(file, JSON.stringify(posts.slice(0, max), null, 2));
console.log(`Saved ${Math.min(posts.length, max)} posts to ${file}`);
