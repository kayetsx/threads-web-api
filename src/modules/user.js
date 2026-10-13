import { page } from '../client.js';
import { NotFoundError, SessionExpiredError } from '../errors.js';

export default {
  async getUserProfile(username) {
    username = username.replace(/^@/, '');
    const { user } = await this.op('BarcelonaUsernameHovercardImplDirectQuery', { username });
    if (!user) throw new NotFoundError(`user not found: @${username}`);
    return user;
  },

  async getUserIDfromUsername(username) {
    return (await this.getUserProfile(username)).pk;
  },

  // Full profile by numeric ID (bio, links, follower_count, …).
  async getUserProfileByID(userID) {
    const { user } = await this.op('BarcelonaProfilePageDirectQuery_byID', { userID, canSeeFeedsTab: true, showLinkedIGStats: false });
    if (!user) throw new NotFoundError(`user not found: ${userID}`);
    return user;
  },

  // The logged-in account.
  me() {
    if (!this.userId) throw new SessionExpiredError('Not logged in (no ds_user_id cookie). Run login first.');
    return this.getUserProfileByID(this.userId);
  },

  // Followers. For other users Meta only returns a sample (~50) with no further pages.
  async getUserFollowers(userID, { first = 20 } = {}) {
    const d = await this.op('BarcelonaFriendshipsFollowersTabQuery', { userID, first: Math.min(first, 20) });
    return page(d.user.followers, e => e.node);
  },

  // Accounts the user follows, fully paginated.
  async getUserFollowing(userID, { after = null, first = 20 } = {}) {
    first = Math.min(first, 20); // Meta rejects larger pages with "execution error"
    const d = after
      ? await this.op('BarcelonaFriendshipsFollowingTabRefetchableQuery', { id: userID, after, first })
      : await this.op('BarcelonaFriendshipsFollowingTabQuery', { userID, first });
    return page((d.user ?? d.fetch__XDTUserDict).following, e => e.node);
  },

  // Profile "Threads" tab.
  async getUserProfileThreads(userID, { after = null, first = 10 } = {}) {
    const vars = { userID, first, allow_page_info_for_lox_user: false };
    const d = after
      ? await this.op('BarcelonaProfileThreadsTabRefetchableDirectQuery', { ...vars, after, before: null, last: null })
      : await this.op('BarcelonaProfileThreadsTabDirectQuery', vars);
    return page(d.mediaData, e => e.node);
  },

  // Profile "Replies" tab. Each item's thread_items = [post replied to, ..., the user's reply].
  async getUserProfileReplies(userID, { after = null, first = 10 } = {}) {
    const d = after
      ? await this.op('BarcelonaProfileRepliesTabRefetchableDirectQuery', { userID, after, before: null, first, last: null, allow_page_info_for_lox_user: false })
      : await this.op('BarcelonaProfileRepliesTabDirectQuery', { userID, first });
    return page(d.mediaData, e => e.node);
  },

  // Profile "Media" tab: the user's threads that contain images or video.
  async getUserProfileMedia(userID, { after = null, first = 10 } = {}) {
    const d = after
      ? await this.op('BarcelonaProfileMediaTabRefetchableDirectQuery', { userID, after, before: null, first, last: null, allow_page_info_for_lox_user: false })
      : await this.op('BarcelonaProfileMediaTabDirectQuery', { userID, first });
    return page(d.mediaData, e => e.node);
  },

  // Profile "Reposts" tab. The original post is at post.text_post_app_info.share_info.reposted_post.
  async getUserProfileReposts(userID, { after = null, first = 10 } = {}) {
    const d = after
      ? await this.op('BarcelonaProfileRepostsTabRefetchableDirectQuery', { userID, after, before: null, first, last: null, allow_page_info_for_lox_user: false })
      : await this.op('BarcelonaProfileRepostsTabDirectQuery', { userID, first });
    return page(d.mediaData, e => e.node);
  },
};
