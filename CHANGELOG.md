# Changelog

## 0.7.1 (2026-10-14)

### Fixed
- Republish after the repo was recreated under the same name (orphaned `0.7.0` package version blocked publishing).

## 0.7.0 (2026-10-14)

### Added
- `proxyFetch(url)`: custom `fetch` that routes requests through an http/https/socks5 proxy, for the `fetch` option. Uses `undici`'s `ProxyAgent` (new dependency).
- `npm run login` and `get-session.js` read a `PROXY` env var and use it automatically.

## 0.6.0 (2026-10-13)

### Added
- `publishToTag(tag, text, options)`: post into a tag like the composer on a tag page (`publish` with `topic`). Takes every publish option. Use the tag's display name, e.g. `'Fashion Threads'`.
- `examples/post-to-tag.js`.
- `simplifyUser()`: raw user -> `{ id, username, fullName, verified, private, bio, followers, avatar }`.
- `cacheFile` option: rediscovered doc_ids survive restarts (skipped when `operations.json` has moved on).
- `.github/workflows/canary.yml`: daily `npm run smoke` against threads.com (needs a `THREADS_COOKIES` secret). `npm run smoke` also reads `THREADS_COOKIES`.

- **Reposts pagination:** `getUserProfileReposts(id, { after })` now pages like the other tabs.
- `validateTag(tag)`; `getDrafts()`, `saveDraft()`, `deleteDraft()` (all drafts, not only scheduled ones).
- `publishToTag('fashionthreads', …)` works: Meta resolves the spelling to the community tag, so no display-name lookup is needed.

### Changed
- The "all methods are mounted" test now lists every public method.

## 0.5.0 (2026-10-13)

### Added
- **Login with cookies:** `new Threads(cookies)` also takes the `cookie` header string copied from the browser (`'sessionid=...; csrftoken=...; ds_user_id=...'`), not just an object.
- `examples/cookies.js`: get cookies after `login()`, then log in with them.

### Changed
- Examples no longer read command-line arguments: inputs (username, post URL, pages) are plain values in each file. Edit them and run `node examples/<name>.js`.

## 0.4.0 (2026-10-13)

### Added
- **Publishing:** `publish(text, options)` for text, photos (JPEG, PNG, WebP), carousels, video (MP4), link previews, polls, topic tags, alt text, replies and quotes; `replyControl` takes `'everyone' | 'following' | 'mentioned'`. @mentions work as plain text. Never retried, so a lost response can't double-post.
- **Post management:** `publishThread()` (multi-post threads), `editPost()`, `deletePost()`, `repost()`, `deleteRepost()`.
- **Scheduling:** `schedulePost()`, `getScheduledPosts()`, `cancelScheduledPost()` (Threads drafts with a publish time).
- **Carousels with video:** `publish(text, { media: [...] })` mixes photos and videos in order; the transcode wait covers carousels too.
- **Moderation:** `block()`/`unblock()`, `mute()`/`unmute()`, `restrict()`/`unrestrict()`.
- **Discovery:** `getRecommendedUsers()`.
- `threads.rest()`: POST helper for Meta's REST endpoints with typed errors.
- `npm run smoke:write`: live check of every write method on your own account; deletes what it posts.

### Changed
- Doc_id discovery also reads ids that mutations inline in their `.graphql` modules, so like/follow/repost/block/mute ids now repair themselves too (~480 operations found, up from ~300).
- Operations can set `"relayFlags": false` in `operations.json` to send only their own relay flags (the edit mutation fails with the full set). `graphql()` takes the same option.
- Server errors whose description says "Try again later" are no longer mistaken for rate limits.
- `npm run login` no longer reads `.env` or environment variables: it prompts, or takes `-- username [password]`. `.env.example` is gone.

## 0.3.0 (2026-10-13)

### Added
- **People:** `me()`, `getUserProfileByID()`, `getUserFollowers()` (Meta returns a ~50 sample for other users), `getUserFollowing()` (paginated).
- **Post activity:** `getPostLikers()`, `getPostReposters()`, `getPostQuotes()` (~100-person samples chosen by Meta).
- **Feeds & activity:** `getFollowingFeed()`, `getNotifications({ filter })` with all Activity filters.
- **Errors:** `ThreadsError` and `SessionExpiredError`, `RateLimitError`, `NotFoundError`, `LoginError`. Login errors now say why (wrong password, unknown user, 2FA, checkpoint).
- **Reliability:**
  - automatic retry with exponential backoff on rate limits and 5xx (`retries`, `retryDelay`)
  - request pacing, `minInterval` (default 1000 ms between requests)
  - automatic repair of rotated GraphQL `doc_id`s (`autoUpdate`, `threads.updateOperations()`)
- **Helpers:** `threads.paginate()` async iterator, `simplifyPost()`, custom `fetch` option (proxies).
- **TypeScript types** (`src/index.d.ts`).
- **Scripts:** `npm run smoke` (live check of every read method), `npm run update-ops` (refresh `operations.json`).
- **Examples:** `people.js`, `notifications.js`.

### Changed
- `getUserProfile()` throws `NotFoundError` instead of returning `null`; `getThreads()` does the same for unknown posts.
- `getThreads()` / `getReplies()` accept post URLs and shortcodes as well as IDs.
- Concurrent first calls share one token page load.

## 0.2.0 (2026-10-13)

### Added
- Profile tabs: `getUserProfileReplies()`, `getUserProfileMedia()`, `getUserProfileReposts()` (first page).
- `like()` / `unlike()` (post URL, shortcode or ID).
- Examples: `user-tabs.js`, `like.js`, `unlike.js`.

## 0.1.1 (2026-10-13)

### Changed
- `follow()` and `unfollow()` are independent methods; separate `follow.js` / `unfollow.js` examples.

## 0.1.0 (2026-10-13)

First release on GitHub Packages as `@kayetsx/threads-web-api`: login with encrypted password, profiles, a user's threads, "For you" feed, post + reply chains, user/post/tag search, `follow()` / `unfollow()`, raw `graphql()`.
