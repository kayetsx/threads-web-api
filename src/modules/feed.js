import { page } from '../client.js';

async function feed(threads, variant, source, { after = null, first = 10 } = {}) {
  const d = await threads.op('BarcelonaFeedPaginationDirectQuery', {
    after, before: null, first, last: null, sort_by: null, variant,
    data: { pagination_source: source, reason: 'pagination', session_id: null, feed_view_info: '[]' },
  });
  return page(d.feedData, e => e.node.text_post_app_thread, true);
}

export default {
  // "For you" feed.
  getFeed(options) {
    return feed(this, 'for_you', 'text_post_feed_threads', options);
  },

  // "Following" feed: only accounts you follow, newest first.
  getFollowingFeed(options) {
    return feed(this, 'following', 'text_post_feed_following', options);
  },
};
