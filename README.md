# threads-web-api

Unofficial Node.js client for [Threads](https://www.threads.com). It uses the same private web API that the threads.com site itself calls: login, profiles, feed, posts, replies, user search, post search and tag search.

> **Not affiliated with Meta.** Using a private API is against Threads' Terms of Use, and your account can be rate-limited or banned. Use a test account. Meta changes this API without notice. The client repairs rotated query IDs by itself (see [Updating doc_ids](docs/ARCHITECTURE.md#updating-doc_ids)), but bigger changes will still break things.

## Install

Requires Node.js 20.12+. Import it as `@kayetsx/threads-web-api` with any install method.

**From GitHub (no login needed):**

```sh
npm install github:kayetsx/threads-web-api
```

**From GitHub Packages:** GitHub requires a token to install packages, even public ones. Create a [personal access token (classic)](https://github.com/settings/tokens) with the `read:packages` scope, then add this to the `.npmrc` file in your project:

```ini
@kayetsx:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

```sh
npm install @kayetsx/threads-web-api
```

**Or clone it:**

```sh
git clone https://github.com/kayetsx/threads-web-api.git
cd threads-web-api
npm install
```

## Log in

```sh
npm run login
```

This prompts for your username and password (or pass them: `npm run login -- username password`; note that a password typed on the command line ends up in your shell history) and writes `session.json`. The password is encrypted the same way the threads.com login form encrypts it, and it is never stored.

**`session.json` is a full login session, so never commit or share it.** It's already in `.gitignore`.

From code:

```js
import { Threads } from '@kayetsx/threads-web-api';

const threads = new Threads();
await threads.login('username', 'password');
// threads.cookies is the session. Save it and pass it to new Threads(cookies) next time.
```

Log in with cookies instead (no password), as an object or the `cookie` header copied from your browser's DevTools:

```js
const threads = new Threads({ sessionid: '...', csrftoken: '...', ds_user_id: '...' });
// or
const threads = new Threads('sessionid=...; csrftoken=...; ds_user_id=...');
```

## Usage

```js
import { readFileSync } from 'node:fs';
import { Threads, getPostIDfromURL } from '@kayetsx/threads-web-api';

const threads = new Threads(JSON.parse(readFileSync('session.json', 'utf8')));

// Users
const profile = await threads.getUserProfile('zuck');
const userID = await threads.getUserIDfromUsername('zuck');
const { items, next } = await threads.getUserProfileThreads(userID);
const page2 = await threads.getUserProfileThreads(userID, { after: next });
const userReplies = await threads.getUserProfileReplies(userID);  // Replies tab
const userMedia = await threads.getUserProfileMedia(userID);      // Media tab
const userReposts = await threads.getUserProfileReposts(userID);  // Reposts tab
const me = await threads.me();                                     // your own profile
const following = await threads.getUserFollowing(userID);          // { items, next }
const followers = await threads.getUserFollowers(userID);          // sample for other users
const notifications = await threads.getNotifications({ filter: 'mentions' });

// Feed and posts
const feed = await threads.getFeed();              // "For you"
const followingFeed = await threads.getFollowingFeed();
const postID = getPostIDfromURL('https://www.threads.com/@zuck/post/DeZtp-TkQHh');
const post = await threads.getThreads(postID);
const replies = await threads.getReplies(postID);

// Search
const users = await threads.searchUsers('zuck');
const posts = await threads.searchPosts('javascript');
// Same as threads.com/search?q=UMKM%20Threads&serp_type=tags&tag_id=18401683369128876
const tagged = await threads.searchTags('UMKM Threads', { tagID: '18401683369128876' });
const latest = await threads.searchTags('UMKM Threads', { recent: true }); // "Recent" tab

// Social (username or numeric user ID)
await threads.follow('zuck');   // { following: true, outgoing_request: false, … }
await threads.unfollow('zuck');
await threads.like('https://www.threads.com/@zuck/post/DeZtp-TkQHh');  // post URL, shortcode or ID → { has_liked, like_count }
await threads.unlike('DeZtp-TkQHh');

// Publish. replyTo / quote take a post URL, shortcode or ID; media is a file path or bytes.
const mine = await threads.publish('Hello @zuck', { topic: 'JavaScript' });  // mentions are plain text
await threads.publish('Nice post', { replyTo: 'DeZtp-TkQHh', replyControl: 'following' });
await threads.publish('Sunset', { image: 'sunset.jpg', alt: 'Orange sky over the sea' });
await threads.publish('', { image: 'sunset.webp' });                    // photo only (JPEG, PNG, WebP)
await threads.publish('Trip', { image: ['a.jpg', 'b.png'], alt: ['Beach', 'Hotel'] });  // carousel
await threads.publish('Clip', { video: 'clip.mp4' });
await threads.publish('Mix', { media: ['a.jpg', 'clip.mp4', 'b.png'] });          // photos + videos carousel
await threads.publish('Tabs or spaces?', { poll: ['Tabs', 'Spaces'] });
await threads.publish('Read this', { link: 'https://example.com' });    // link preview card
await threads.publishToTag('fashionthreads', 'OOTD', { image: 'ootd.jpg' });   // post into a tag
await threads.publishThread(['1/3 Long story…', '2/3 …', { text: '3/3 The end', image: 'end.jpg' }]);
await threads.editPost(mine.pk, 'Hello again');

// Scheduled posts (same options as publish, minus replyTo / quote)
const { id } = await threads.schedulePost('Good morning', { at: '2026-10-20T08:00:00+07:00', image: 'sun.jpg' });
await threads.getScheduledPosts();      // [{ id, scheduled_time, text, draft }]
await threads.cancelScheduledPost(id);  // { deleted: true }

// Drafts (scheduled or not)
const { id: draftId } = await threads.saveDraft('Later', { image: 'a.jpg', topic: 'JavaScript' });
await threads.getDrafts();              // [{ id, scheduled_time | null, text, draft }]
await threads.deleteDraft(draftId);     // { deleted: true }
await threads.deletePost(mine.pk);                    // { did_delete: true }
await threads.repost('DeZtp-TkQHh');                  // { reposted: true, repost_count }
await threads.deleteRepost('DeZtp-TkQHh');            // { reposted: false }

// Moderation (username or numeric user ID)
await threads.block('spammer');   await threads.unblock('spammer');    // { blocking }
await threads.mute('loud');       await threads.unmute('loud');        // { muting }
await threads.restrict('troll');  await threads.unrestrict('troll');   // { restricted }
const suggested = await threads.getRecommendedUsers();
```

### Examples

Every example runs after `npm run login`. Inputs (username, post URL, pages) are plain values at the top of each file, edit them and run:

| Example | Run | Shows |
| --- | --- | --- |
| [login.js](examples/login.js) | `node examples/login.js` | log in from code, save the session |
| [cookies.js](examples/cookies.js) | `node examples/cookies.js` | get cookies, log in with cookies |
| [user-profile.js](examples/user-profile.js) | `node examples/user-profile.js` | profile, followers, bio, avatar |
| [user-threads.js](examples/user-threads.js) | `node examples/user-threads.js` | a user's posts, paginated |
| [user-tabs.js](examples/user-tabs.js) | `node examples/user-tabs.js` | any profile tab: `threads`, `replies`, `media`, `reposts` |
| [feed.js](examples/feed.js) | `node examples/feed.js` | "For you" feed |
| [post-replies.js](examples/post-replies.js) | `node examples/post-replies.js` | a post and its reply chains |
| [search-users.js](examples/search-users.js) | `node examples/search-users.js` | user search |
| [search-posts.js](examples/search-posts.js) | `node examples/search-posts.js` | post search, Top or Recent |
| [search-tags.js](examples/search-tags.js) | `node examples/search-tags.js` | tag search |
| [post-to-tag.js](examples/post-to-tag.js) | `node examples/post-to-tag.js` | post into a tag: text, photo, video, reply |
| [follow.js](examples/follow.js) | `node examples/follow.js` | follow a user |
| [unfollow.js](examples/unfollow.js) | `node examples/unfollow.js` | unfollow a user |
| [like.js](examples/like.js) | `node examples/like.js` | like a post |
| [unlike.js](examples/unlike.js) | `node examples/unlike.js` | unlike a post |
| [people.js](examples/people.js) | `node examples/people.js` | followers, following, likers, reposters, quotes |
| [notifications.js](examples/notifications.js) | `node examples/notifications.js` | your profile + notifications |
| [export-json.js](examples/export-json.js) | `node examples/export-json.js` | save a user's posts to JSON |
| [raw-graphql.js](examples/raw-graphql.js) | `node examples/raw-graphql.js` | call any GraphQL operation directly |
| [quickstart.js](examples/quickstart.js) | `node examples/quickstart.js` | a bit of everything |

## API

Paginated methods return `{ items, next }`. Pass `next` back as `after` to get the next page; it's `null` on the last page. The server decides page sizes, so `first` is only a hint.

| Method | Returns |
| --- | --- |
| `login(username, password)` | login response, and sets `threads.cookies` |
| **Users** | |
| `getUserProfile(username)` | user object |
| `getUserIDfromUsername(username)` | user ID string |
| `getUserProfileThreads(userID, { after, first })` | `{ items, next }` (Threads tab) |
| `getUserProfileReplies(userID, { after, first })` | `{ items, next }` (Replies tab); `thread_items` = `[post replied to, …, the user's reply]` |
| `getUserProfileMedia(userID, { after, first })` | `{ items, next }` (Media tab, posts with images or video) |
| `getUserProfileReposts(userID, { after, first })` | `{ items, next }` (Reposts tab); the original is at `post.text_post_app_info.share_info.reposted_post` |
| **Feed & posts** | |
| `getUserProfileByID(userID)` | user object (full profile) |
| `me()` | your own profile |
| `getUserFollowers(userID)` | `{ items, next }`; for other users Meta returns a ~50 sample and `next` is null |
| `getUserFollowing(userID, { after, first })` | `{ items, next }`, fully paginated (max 20 per page) |
| `getNotifications({ filter, after, first })` | `{ items, next }`; filter: `all`, `follows`, `replies`, `mentions`, `quotes`, `reposts`. Item: `{ id, type, title, text, timestamp, users, images, url }` |
| `getFeed({ after, first })` | `{ items, next }` ("For you") |
| `getFollowingFeed({ after, first })` | `{ items, next }` ("Following") |
| `getPostLikers(post)` / `getPostReposters(post)` / `getPostQuotes(post)` | `[{ user, timestamp, text, url }]`, a ~100 sample chosen by Meta |
| `getThreads(postID)` | post object |
| `getReplies(postID, { after, first, sortOrder })` | `{ items, next }`; each item is a reply chain `[reply, ...nestedReplies]` |
| **Search** | |
| `searchUsers(query, { first })` | user array |
| `getRecommendedUsers()` | ~15 suggested users (search page) |
| `searchPosts(query, { type, tagID, recent, after, first })` | `{ items, next }`; `type` is the URL's `serp_type` (`default` or `tags`) |
| `searchTags(tag, { tagID, recent, after, first })` | `{ items, next }` |
| **Social** | |
| `follow(usernameOrID)` | `{ following, outgoing_request }`; `outgoing_request` is true for a pending request to a private account |
| `unfollow(usernameOrID)` | `{ following, outgoing_request }` |
| `like(postUrlOrID)` | `{ has_liked, like_count }` |
| `unlike(postUrlOrID)` | `{ has_liked, like_count }` |
| `publish(text, { media, image, video, alt, link, poll, topic, replyTo, quote, replyControl })` | new post object. `image`: path or bytes (JPEG, PNG, WebP), an array for a carousel; `video`: one MP4; `media`: photos and videos mixed, in order; `alt`: alt text (array for carousels); `poll`: 2–4 options, text posts only; `topic`: topic tag; `replyControl`: `'everyone'` (default), `'following'`, `'mentioned'`. @mentions are plain text. Never retried (avoids double posts) |
| `validateTag(tag)` | `{ valid, sensitive }`, the composer's check before posting into a tag |
| `publishToTag(tag, text, options)` | same as `publish` with `topic: tag` (any spelling Meta resolves: `'fashionthreads'` lands in the `Fashion Threads` community); takes any publish option (image, video, media, replyTo, …) |
| `publishThread(posts, { replyTo })` | array of posts; each replies to the one before. `posts`: strings or `{ text, ...publish options }` |
| `editPost(post, text, { replyControl, topic })` | the edited post |
| `schedulePost(text, { at, ...publish options })` | `{ id, scheduled_time }`; `at` is a Date, ms timestamp or date string. `quote` / `replyTo` aren't supported (Meta drops quotes from scheduled drafts) |
| `getScheduledPosts()` | `[{ id, scheduled_time, text, draft }]`, soonest first |
| `cancelScheduledPost(id)` | `{ deleted: true }` |
| `getDrafts()` | `[{ id, scheduled_time \| null, text, draft }]`, all drafts |
| `saveDraft(text, options)` | `{ id }`; publish options minus `replyTo` / `quote` |
| `deleteDraft(id)` | `{ deleted: true }` (a scheduled draft stops being scheduled) |
| `deletePost(post)` | `{ did_delete }`; your own posts only, permanent. Meta has returned `false` for a video post it did delete; `getThreads()` throwing `NotFoundError` confirms it's gone |
| `repost(post)` / `deleteRepost(post)` | `{ reposted, repost_count }` / `{ reposted: false }` |
| `block(user)` / `unblock(user)` | `{ blocking }`; blocking also removes follows both ways |
| `mute(user)` / `unmute(user)` | `{ muting }`; muted users vanish from your feeds |
| `restrict(user)` / `unrestrict(user)` | `{ restricted }`; a restricted user's replies are only visible to them |
| **Low level** | |
| `graphql(name, docId, variables, path)` | raw `data` for any other GraphQL operation |
| `getPostIDfromURL(urlOrShortcode)` | post ID string |

In thread items, the post is at `item.thread_items[0].post`, with `user`, `caption.text`, `like_count`, `taken_at`, `image_versions2`, `video_versions` and more.

Media URLs (`profile_pic_url`, `image_versions2`, …) are signed and expire. Use them as they come back and don't edit or cut them, or you'll get `Bad URL hash`.

### Simplified posts

Raw posts have 50+ fields. `simplifyPost()` keeps the useful ones:

```js
import { simplifyPost } from '@kayetsx/threads-web-api';

const post = simplifyPost(await threads.getThreads('https://www.threads.com/@zuck/post/DeZtp-TkQHh'));
// { id, code, url, text, author: { id, username, fullName, verified, avatar }, createdAt,
//   type: 'image' | 'video' | 'carousel' | 'text', media: [{ type, url }], likes, replies,
//   reposts, quotes, shares, isReply, hasLiked, repostOf, quoteOf }
```

`simplifyUser()` does the same for users (a profile, a follower, a search hit):

```js
import { simplifyUser } from '@kayetsx/threads-web-api';

simplifyUser(await threads.getUserProfile('zuck'));
// { id, username, fullName, verified, private, bio, followers, avatar }
// followers is null for users returned by lists and search (only profile queries carry the count)
```

### Auto-pagination

```js
for await (const thread of threads.paginate(after => threads.getUserProfileThreads(userID, { after }), { maxPages: 5, delay: 1000 })) {
  console.log(thread.thread_items[0].post.caption?.text);
}
```

`maxPages` caps the number of requests, and `delay` (ms) waits between pages.

### Errors

Every error is a `ThreadsError`. Catch these subclasses to tell them apart:

| Error | When | What to do |
| --- | --- | --- |
| `SessionExpiredError` | not logged in, or the session was logged out/expired | run `npm run login` again |
| `RateLimitError` | Meta is throttling you. Retried automatically first (3×, 2s → 4s → 8s) | slow down, use `delay` |
| `NotFoundError` | the user or post doesn't exist or isn't visible | |
| `LoginError` | wrong password, unknown user, 2FA or checkpoint | read `err.message`, `err.response` |

```js
import { SessionExpiredError, RateLimitError } from '@kayetsx/threads-web-api';

try {
  await threads.getFeed();
} catch (e) {
  if (e instanceof SessionExpiredError) { /* log in again */ }
  else if (e instanceof RateLimitError) { /* wait longer */ }
  else throw e;
}
```

### When Meta changes query IDs

Every Threads query has a `doc_id` that Meta changes from time to time. When one goes stale, the client finds the new ID in threads.com's own JavaScript and retries, usually within a few seconds, once per `Threads` instance. You can also run it yourself:

```js
const changed = await threads.updateOperations();  // [{ name, from, to }] vs the bundled IDs
```

Maintainers: `npm run update-ops` rewrites `src/operations.json` with the current IDs. A few click-only operations (like, follow) can't be discovered this way; the script lists them.

### Options and proxies

```js
const threads = new Threads(cookies, {
  retries: 3,        // rate-limit / 5xx retries (default 3, 0 to disable)
  retryDelay: 2000,  // first backoff in ms, doubled each retry
  autoUpdate: true,  // repair rotated GraphQL doc_ids automatically (see below)
  minInterval: 1000, // min ms between requests to threads.com; parallel calls queue (0 = off)
  cacheFile: 'doc-ids.json', // keep rediscovered doc_ids between runs (default: none)
  fetch: myFetch,    // custom fetch, e.g. through a proxy
});
```

With `cacheFile`, a doc_id that was repaired once is saved and reused on the next start instead of failing and rescanning again. Entries are ignored automatically once a newer package version ships its own ids.

Several accounts: make one `Threads` per account. Each holds its own cookies and its own request pacing, so accounts never share a session. Give each its own `fetch` (and proxy) if they shouldn't share an IP.

```js
import { Threads, proxyFetch } from '@kayetsx/threads-web-api';

const a = new Threads(cookiesA, { cacheFile: 'ids-a.json' });
const b = new Threads(cookiesB, { fetch: proxyFetch('http://user:pass@proxy.example.com:8080') });
```

`proxyFetch(url)` routes every request through an http/https/socks5 proxy. `npm run login` and `get-session.js` also pick one up from a `PROXY` env var:

```sh
PROXY=http://user:pass@proxy.example.com:8080 npm run login
```

### TypeScript

Types ship with the package (`src/index.d.ts`): every method, `Page<T>`, `Post`, `User`, `Thread`, `SimplePost` and the error classes. The package is ESM-only, so use `"type": "module"` or `.mts` files.

## Project layout

```
src/            client, login, GraphQL operations, feature modules
bin/login.js    interactive login → session.json
examples/       runnable scripts
test/           offline tests (node --test)
docs/           how the private API works
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how login encryption, tokens and GraphQL work.

## Roadmap

- [ ] 2FA and checkpoint login
- [x] Follow / unfollow
- [x] Like / unlike
- [x] Publish: text, photo, carousel, video, link, poll, topic, alt text, reply, quote, multi-post threads; edit; delete; repost
- [x] Block, mute, restrict; recommended users
- [x] Videos inside carousels, scheduled posts
- [ ] Scheduled quotes / replies, scheduled multi-post threads
- [x] Automatic doc_id repair + `npm run update-ops`
- [x] Notifications, followers/following, likers/reposters/quotes, Following feed, me()
- [x] TypeScript types
- [x] Typed errors, automatic retry on rate limits, auto-pagination, simplified posts, proxy support

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). For security issues, see [SECURITY.md](SECURITY.md). Release notes are in [CHANGELOG.md](CHANGELOG.md).

`npm run smoke` checks every read method against the live API (read-only, about 90 s, needs `session.json`).
`npm run smoke:write` checks every write method on your own account and deletes what it posted (about 90 s; `-- --video clip.mp4` adds a video post, `-- --target <user>` runs mute/restrict and undoes them).

## License

[MIT](LICENSE)
