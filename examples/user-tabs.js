// A user's profile tabs: Threads, Replies, Media, Reposts.
import { threads, line } from './_session.js';

const username = 'zuck';
const tab = 'threads'; // threads | replies | media | reposts
const pages = 1;

const fetchers = {
  threads: (id, o) => threads.getUserProfileThreads(id, o),
  replies: (id, o) => threads.getUserProfileReplies(id, o),
  media: (id, o) => threads.getUserProfileMedia(id, o),
  reposts: (id, o) => threads.getUserProfileReposts(id, o),
};
if (!fetchers[tab]) {
  console.error('Tab must be one of: threads, replies, media, reposts');
  process.exit(1);
}

const userID = await threads.getUserIDfromUsername(username);
let after = null;
for (let i = 1; i <= pages; i++) {
  const { items, next } = await fetchers[tab](userID, { after });
  for (const item of items) {
    const posts = item.thread_items.map(t => t.post);
    if (tab === 'reposts') {
      const original = posts[0].text_post_app_info?.share_info?.reposted_post;
      console.log('REPOST', original ? line(original) : '(original unavailable)');
    } else if (tab === 'replies') {
      // [post being replied to, ..., the user's reply]
      console.log('  in reply to', line(posts[0]));
      console.log('REPLY       ', line(posts.at(-1)));
    } else {
      const media = posts[0].carousel_media?.length ?? (posts[0].video_versions?.length ? 'video' : posts[0].image_versions2?.candidates?.length ? 'image' : 0);
      console.log(line(posts[0]), tab === 'media' ? `[${media}${typeof media === 'number' && media ? ' items' : ''}]` : '');
    }
  }
  if (!(after = next)) break;
}
