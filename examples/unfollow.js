// Unfollow a user (by username or numeric ID).
import { threads } from './_session.js';

const status = await threads.unfollow('zuck');

if (!status.following) console.log('Unfollowed @zuck');
else console.log('Unfollow failed: still following @zuck');
