// Followers, following, and who liked / reposted / quoted a post.
import { threads } from './_session.js';

const what = 'followers'; // followers | following | likers | reposters | quotes
const target = 'zuck'; // a username, or a post URL for likers/reposters/quotes
const pages = 1;
const show = u => `@${u.username}${u.full_name ? ` (${u.full_name})` : ''}`;

if (what === 'followers' || what === 'following') {
  const id = await threads.getUserIDfromUsername(target ?? 'zuck');
  const fetchPage = what === 'followers'
    ? () => threads.getUserFollowers(id)
    : after => threads.getUserFollowing(id, { after });
  let n = 0;
  for await (const u of threads.paginate(fetchPage, { maxPages: Number(pages), delay: 500 })) console.log(++n, show(u));
} else if (['likers', 'reposters', 'quotes'].includes(what)) {
  const fn = { likers: 'getPostLikers', reposters: 'getPostReposters', quotes: 'getPostQuotes' }[what];
  const rows = await threads[fn](target ?? 'https://www.threads.com/@zuck/post/DeZtp-TkQHh');
  for (const r of rows) console.log(show(r.user), r.text ? `: ${r.text.replace(/\s+/g, ' ').slice(0, 70)}` : '');
  console.log(`(${rows.length}, a sample chosen by Meta)`);
} else {
  console.error('`what` must be one of: followers, following, likers, reposters, quotes');
  process.exit(1);
}
