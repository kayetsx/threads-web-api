import { page } from '../client.js';

export default {
  // "Suggested for you" on the search page: ~15 users, no paging.
  async getRecommendedUsers() {
    const d = await this.op('BarcelonaSearchRecommendedUsersQuery', {});
    return d.recommendedUsers.edges.map(e => e.node);
  },

  async searchUsers(query, { first = 10 } = {}) {
    const d = await this.op('useBarcelonaAccountSearchGraphQLDataSourceQuery', {
      query, first, should_fetch_ig_inactive_on_text_app: false, should_fetch_friendship_status: true,
      should_fetch_fediverse_profiles: true, should_fetch_mention_restriction: false,
      hide_unconnected_private: false, is_internal_user: false,
    });
    return d.xdt_api__v1__users__search_connection.edges.map(e => e.node);
  },

  // Post search, same as threads.com/search?q=...&serp_type=<type>. recent: true = "Recent" tab instead of "Top".
  async searchPosts(query, { type = 'default', tagID = null, recent = false, after = null, first = 10 } = {}) {
    const d = await this.op('BarcelonaSearchResultsRefetchableQuery', {
      query, search_surface: type, tagID, recent: recent ? 1 : 0, after, before: null, first, last: null,
      has_communities: true, has_community_green_dot: false, has_favicons: false, has_live_chats: false,
      has_serp_header: false, meta_place_id: null, pinned_ids: null, power_search_info: null, trend_fbid: null,
    });
    return page(d.searchResults, e => e.node.thread, true);
  },

  // Tag search: threads.com/search?q=UMKM%20Threads&serp_type=tags&tag_id=18401683369128876
  searchTags(tag, { tagID = null, ...opts } = {}) {
    return this.searchPosts(tag, { ...opts, type: 'tags', tagID });
  },
};
