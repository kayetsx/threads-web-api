// Your notifications, plus a "me" summary.
import { threads } from './_session.js';

const me = await threads.me();
console.log(`Logged in as @${me.username}, ${me.follower_count} followers\n`);

const { items } = await threads.getNotifications({ filter: 'all' }); // all | follows | replies | mentions | quotes | reposts
for (const n of items) {
  const when = new Date(n.timestamp * 1000).toISOString().slice(0, 16);
  console.log(`${when} [${n.type.replace('text_post_app_', '')}] ${n.title}${n.text ? ' | ' + n.text.slice(0, 60) : ''}`);
}
