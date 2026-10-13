// Like a post (by URL, shortcode or numeric post ID).
import { threads } from './_session.js';

const { has_liked, like_count } = await threads.like('https://www.threads.com/@zuck/post/DeZtp-TkQHh');
console.log(has_liked ? `Liked (${like_count} likes)` : 'Like failed');
