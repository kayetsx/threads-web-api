// Post into a tag, like the composer on threads.com/search?q=...&serp_type=tags.
// Edit the values, then run: node examples/post-to-tag.js
import { threads } from './_session.js';

const tag = 'fashionthreads'; // any spelling Meta resolves; this one lands in the 'Fashion Threads' community
const text = 'Hello from the API';
const image = null;   // 'photo.jpg', or ['a.jpg', 'b.png'] for a carousel
const video = null;   // 'clip.mp4'
const replyTo = null; // post URL or shortcode, to reply to a post you found in the tag

const post = await threads.publishToTag(tag, text, {
  ...(image && { image }), ...(video && { video }), ...(replyTo && { replyTo }),
});
console.log(`Posted: https://www.threads.com/@${post.user.username}/post/${post.code}`);
