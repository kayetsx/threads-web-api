// Accepts a numeric user ID or a username (with or without @).
async function toUserID(threads, user) {
  return /^\d+$/.test(user) ? user : threads.getUserIDfromUsername(user);
}

export default {
  // Returns friendship_status: { following, outgoing_request (true = pending request to a private account), ... }
  async follow(user) {
    const { user: u } = await this.op('useTHFollowMutationFollowMutation', {
      target_user_id: await toUserID(this, user),
      media_id_attribution: null, container_module: 'ig_text_feed_profile', ranking_info_token: null,
      barcelona_source_quote_post_id: null, barcelona_source_reply_id: null,
    });
    return u.friendship_status;
  },

  // Returns friendship_status: { following: false, ... } on success.
  async unfollow(user) {
    const { user: u } = await this.op('useTHFollowMutationUnfollowMutation', {
      target_user_id: await toUserID(this, user),
      media_id_attribution: null, container_module: 'ig_text_feed_profile', ranking_info_token: null,
      barcelona_source_quote_post_id: null, barcelona_source_reply_id: null,
    });
    return u.friendship_status;
  },

  // Returns { blocking: true }. Blocking also removes follows in both directions.
  async block(user) {
    const { record } = await this.op('useTHUserBlockMutation', {
      user_id: await toUserID(this, user), media_id: null, container_module: 'ig_text_feed_profile',
      barcelona_source_quote_post_id: null, barcelona_source_reply_id: null, ranking_info_token: null,
      consistent_thread_fbid: null, is_messaging_nua: false,
    });
    return { blocking: record.user.friendship_status.blocking };
  },

  // Meta's reply carries no state, so this returns { blocking: false } once the call succeeds.
  async unblock(user) {
    await this.op('useTHUserUnblockMutation', {
      user_id: await toUserID(this, user), media_id: null, container_module: 'ig_text_feed_profile',
      consistent_thread_fbid: null, is_messaging_nua: false,
    });
    return { blocking: false };
  },

  // Muted users' posts disappear from your feeds; they aren't told. Returns { muting }.
  async mute(user) {
    const { record } = await this.op('useTHMuteMutationMuteMutation', {
      userID: await toUserID(this, user), media_id: null, container_module: 'ig_text_feed_profile',
      barcelona_source_quote_post_id: null, barcelona_source_reply_id: null, ranking_info_token: null,
    });
    return { muting: record.user.friendship_status.muting };
  },

  async unmute(user) {
    const { record } = await this.op('useTHMuteMutationUnmuteMutation', { userID: await toUserID(this, user), media_id: null, container_module: 'ig_text_feed_profile' });
    return { muting: record.user.friendship_status.muting };
  },

  // Restricted users' replies are only visible to them. REST, not GraphQL. Returns { restricted }.
  async restrict(user) {
    await this.rest('restrict', '/api/v1/web/restrict_action/restrict/', { body: new URLSearchParams({ target_user_id: await toUserID(this, user) }) });
    return { restricted: true };
  },

  async unrestrict(user) {
    await this.rest('unrestrict', '/api/v1/web/restrict_action/unrestrict/', { body: new URLSearchParams({ target_user_id: await toUserID(this, user) }) });
    return { restricted: false };
  },
};
