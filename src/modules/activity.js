import { page } from '../client.js';

// Same filters as the "Activity ▾" menu on threads.com.
const FILTERS = {
  all: null,
  follows: 'text_post_app_user_follows',
  replies: 'text_post_app_replies',
  mentions: 'text_post_app_mentions',
  quotes: 'text_post_app_quote_posts',
  reposts: 'text_post_app_reposts',
};

export default {
  /**
   * Your notifications (Activity). filter: all | follows | replies | mentions | quotes | reposts.
   * Items: { id, type, title, text, timestamp, users: [username], images: [url], url }
   */
  async getNotifications({ filter = 'all', after = null, first = 20 } = {}) {
    if (!(filter in FILTERS)) throw new Error(`unknown filter "${filter}", use one of: ${Object.keys(FILTERS).join(', ')}`);
    const d = await this.op('BarcelonaActivityFeedV2StoryListContainerQuery', { first, after, selected_filters: FILTERS[filter] });
    const res = page(d.notifications, ({ node: n }) => n.__typename === 'XTHNotificationFeedRow' ? {
      id: n.edge_id,
      type: n.notif_name,
      title: n.title?.text ?? '',
      text: n.subtitle?.text ?? n.body?.text ?? '',
      timestamp: n.timestamp,
      users: (n.sender_users?.edges ?? []).map(e => e.node?.username).filter(Boolean),
      images: n.image_list ?? [],
      url: n.destination ?? null,
    } : null, true); // drops "Today" / "This week" section headers
    return res;
  },
};
