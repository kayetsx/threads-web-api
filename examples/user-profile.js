import { threads } from './_session.js';

const user = await threads.getUserProfile('zuck');

console.log({
  id: user.pk,
  username: user.username,
  fullName: user.full_name,
  verified: user.is_verified,
  private: user.text_post_app_is_private,
  followers: user.follower_count,
  bio: user.biography,
  avatar: user.hd_profile_pic_versions?.at(-1)?.url ?? user.profile_pic_url,
});
