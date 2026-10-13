const MEDIA_TYPE = { 1: 'image', 2: 'video', 8: 'carousel' };

const mediaOf = p => p.video_versions?.length
  ? { type: 'video', url: p.video_versions[0].url, thumbnail: p.image_versions2?.candidates?.[0]?.url ?? null }
  : p.image_versions2?.candidates?.length
    ? { type: 'image', url: p.image_versions2.candidates[0].url }
    : null;

/**
 * Raw post (50+ fields) -> the fields most people need.
 * Media URLs are signed and expire after a few days; download them rather than storing the URLs.
 */
export function simplifyPost(post) {
  const info = post.text_post_app_info ?? {};
  return {
    id: post.pk,
    code: post.code,
    url: `https://www.threads.com/@${post.user?.username}/post/${post.code}`,
    text: post.caption?.text ?? '',
    author: {
      id: post.user?.pk,
      username: post.user?.username,
      fullName: post.user?.full_name ?? null,
      verified: !!post.user?.is_verified,
      avatar: post.user?.profile_pic_url ?? null,
    },
    createdAt: new Date(post.taken_at * 1000).toISOString(),
    type: MEDIA_TYPE[post.media_type] ?? 'text',
    media: (post.carousel_media ?? [post]).map(mediaOf).filter(Boolean),
    likes: post.like_count ?? 0,
    replies: info.direct_reply_count ?? 0,
    reposts: info.repost_count ?? 0,
    quotes: info.quote_count ?? 0,
    shares: info.reshare_count ?? 0,
    isReply: !!info.is_reply,
    hasLiked: !!post.has_liked,
    repostOf: info.share_info?.reposted_post ? simplifyPost(info.share_info.reposted_post) : null,
    quoteOf: info.share_info?.quoted_post ? simplifyPost(info.share_info.quoted_post) : null,
  };
}

/** Raw user (profile, follower, search hit) -> the fields most people need. */
export function simplifyUser(user) {
  return {
    id: user.pk,
    username: user.username,
    fullName: user.full_name ?? null,
    verified: !!user.is_verified,
    private: !!user.text_post_app_is_private,
    bio: user.biography ?? '',
    followers: user.follower_count ?? null, // only profile queries carry the count
    avatar: user.hd_profile_pic_versions?.at(-1)?.url ?? user.profile_pic_url ?? null,
  };
}
