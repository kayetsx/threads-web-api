// Unlike a post (by URL, shortcode or numeric post ID).
import { threads } from './_session.js';

const { has_liked, like_count } = await threads.unlike('https://www.threads.com/@zuck/post/DeZtp-TkQHh');
console.log(!has_liked ? `Unliked (${like_count} likes)` : 'Unlike failed');
