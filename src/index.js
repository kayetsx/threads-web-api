import { Threads } from './client.js';
import auth from './auth.js';
import user from './modules/user.js';
import feed from './modules/feed.js';
import content from './modules/content.js';
import search from './modules/search.js';
import social from './modules/social.js';
import activity from './modules/activity.js';

Object.assign(Threads.prototype, auth, user, feed, content, search, social, activity);

export { Threads };
export { encryptPassword, jazoest } from './auth.js';
export { getPostIDfromURL } from './modules/content.js';
export { simplifyPost, simplifyUser } from './simplify.js';
export { ThreadsError, SessionExpiredError, RateLimitError, NotFoundError, LoginError } from './errors.js';
export { proxyFetch } from './proxy.js';
