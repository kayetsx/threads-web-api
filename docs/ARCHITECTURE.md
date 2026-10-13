# Architecture

threads-web-api talks to the same private endpoints the threads.com website uses. Nothing here is an official Meta API.

```
src/
  index.js            public exports; mounts the modules onto Threads.prototype
  client.js           transport: cookies, redirects, page tokens, GraphQL, retries, paginate
  errors.js           ThreadsError and subclasses
  simplify.js         simplifyPost()
  discover.js         finds current doc_ids in threads.com scripts
  index.d.ts          TypeScript types
  auth.js             login + password encryption
  operations.json     GraphQL operation names, doc_ids, relay flags
  modules/
    user.js           profiles, me, followers/following, profile tabs
    feed.js           "For you" and "Following" feeds
    activity.js       notifications
    content.js        single post, replies, likers/reposters/quotes, like, publish, repost
    search.js         users, posts, tags, recommended users
    social.js         follow, block, mute, restrict
bin/login.js          interactive login, writes session.json
bin/update-ops.js     refreshes doc_ids in operations.json
bin/smoke.js          live check of every read method
```

## Session

A session is a plain object of cookies (`sessionid`, `csrftoken`, `ds_user_id`, `mid`, …). `Threads` keeps it in `this.cookies` and updates it from every `Set-Cookie` response, so save `threads.cookies` again after long runs if you want refreshed values.

Before the first GraphQL call, the client loads `https://www.threads.com/` and scrapes two tokens from the HTML:

| Token | Where it comes from | Used as |
| --- | --- | --- |
| `fb_dtsg` | `["DTSGInitialData",[],{"token":"…"}]` | body param, CSRF for GraphQL |
| `lsd` | `["LSD",[],{"token":"…"}]` | body param + `x-fb-lsd` header |

Page loads must send browser navigation headers (`sec-fetch-*`, `accept: text/html…`). Without them Meta serves a stripped page that is missing the login encryption key.

## Login

`POST /api/v1/web/accounts/login/ajax/`, form-encoded:

| Field | Value |
| --- | --- |
| `username` | username, email or phone |
| `enc_password` | `#PWD_BROWSER:10:<unix ts>:<base64 payload>` |
| `jazoest` | `"2"` + sum of the char codes of the `lsd` token |
| `optIntoOneTap`, `queryParams`, `stopDeletionNonce`, `textAppStopDeletionToken`, `can_threads_signup_with_ig` | `false`, `{}`, `""`, `""`, `false` |

### Password encryption (version 10)

The login page embeds `"key_id":"215","public_key":"<64 hex>","version":"10"`. That public key is an X25519 key.

1. Generate a random 32-byte AES key.
2. AES-256-GCM encrypt the password with a zero 12-byte IV and the timestamp string as additional data.
3. Seal the AES key to Meta's public key with libsodium `crypto_box_seal` (80 bytes).
4. Payload = `[1, key_id, sealedLen & 255, sealedLen >> 8] + sealedKey + gcmTag(16) + ciphertext`, base64.

`test/threads.test.js` round-trips this with a local keypair.

The response is `{ authenticated, userId, status, … }`. 2FA and checkpoint challenges are not implemented yet; the raw response is thrown so you can see which one happened.

## GraphQL

Two endpoints, both `POST` with a form body: `/api/graphql` and `/graphql/query`. Which one an operation uses is recorded in `operations.json`.

| Param | Value |
| --- | --- |
| `doc_id` | persisted query ID, from `operations.json` |
| `fb_api_req_friendly_name` | operation name (also sent as `x-fb-friendly-name`) |
| `variables` | JSON: the operation's variables + relay flags |
| `fb_dtsg`, `lsd`, `jazoest` | session tokens; `jazoest` is derived from `fb_dtsg` here |
| `av` | viewer user ID (`ds_user_id` cookie) |

### Relay flags

Every query also needs about 55 `__relay_internal__pv__Barcelona<Name>relayprovider` booleans in `variables`. If they are missing, the request still returns `200` but every field resolves to `{"message":"execution error"}`. They're stored compactly in `operations.json` → `relayFlags` and merged into every request.

### Per-operation flags

A few mutations fail with `execution error` when they get relay flags their document doesn't declare (the post edit mutation does). Those set `"relayFlags": false` in `operations.json` and pass their own flags in `variables`.

## Publishing (REST)

Posting doesn't use GraphQL. It's the same form-encoded `/api/v1` calls the web composer makes, sent through `threads.rest()` (no retries: a retry after a lost response could post twice).

| Step | Request |
| --- | --- |
| Upload a photo | `POST /rupload_igphoto/fb_uploader_<upload_id>`, raw bytes; headers `X-Entity-Type`, `X-Entity-Length`, `X-Entity-Name`, `Offset: 0`, `X-Instagram-Rupload-Params` (`upload_id`, `media_type: 1`, width, height, `is_sidecar`, `is_threads`) |
| Upload a video | same at `/rupload_igvideo/…` with `media_type: 2`, `extract_cover_frame: "1"` |
| Text post | `POST /api/v1/media/configure_text_only_post/`, `publish_mode=text_post` |
| Single photo/video | `POST /api/v1/media/configure_text_post_app_feed/`, `is_threads=true`, `upload_id` |
| Carousel | `POST /api/v1/media/configure_text_post_app_sidecar/`, a JSON body with `children_metadata: [{ upload_id }]`, sent as `text/plain` like the browser does (`application/json` is rejected with an empty `fail`) |

Scheduling is GraphQL: `useTHDraftCreateMutationMutation` saves the post as a draft (`draft_thread_items: [{ text, attachment_upload_ids, … }]`, upload ids from rupload), then `useTHSchedulePostMutationMutation` sets `{ draft_id, schedule_publish_state: 'SCHEDULED', schedule_publish_time }` (unix seconds). The drafts list query shows the schedule; deleting the draft cancels it.

All three configure calls share `caption` and a JSON `text_post_app_info` (`reply_control` 0/1/2, `reply_id`, `quoted_post_id`, `link_attachment_url`, `tag_header` for the topic, `text_with_entities`). Polls go in `caption_add_on`. A multi-post thread is each post published as a reply to the previous one. Edit, delete, repost, block and mute are GraphQL mutations; restrict is `POST /api/v1/web/restrict_action/restrict/`.

## Pagination

Lists are Relay connections (`edges` + `page_info`). Every paginated method returns `{ items, next }`. `next` is `page_info.end_cursor` when `has_next_page` is true, otherwise `null`. Pass it back as `after`. Some operations use a different "refetch" query for page 2+, and the modules handle that.

## Updating doc_ids

Meta ships new web builds often, and `doc_id`s change with them. Most of this is handled automatically.

### Automatic (src/discover.js)

Every persisted query ships in threads.com's JavaScript as a tiny module:

```js
__d("BarcelonaFeedPaginationDirectQuery_threadsRelayOperation",[],(function(t,n,r,o,a,i){a.exports="28828968350087565"}),null);
```

`discoverDocIds()` loads a few pages (home, a profile, a post, search, activity…), fetches the scripts they reference, and reads every `<Name>_threadsRelayOperation` → id pair, plus the ids that mutations (like, follow, repost, block, mute…) inline in their generated `.graphql` modules as `params:{id:"…",…,name:"…"}` (~480 operations). When a call made through `op()` fails with Meta's stale-id error (`execution error` on `/graphql/query`, `Exception was thrown during the execution of a query` on `/api/graphql`), the client scans pages until it finds that operation. If the id changed, it retries once with the new id; if not, it rethrows the original error. Scanned pages are remembered per `Threads` instance, so it's usually a single 2–5 s scan. Disable it with `new Threads(cookies, { autoUpdate: false })`.

`npm run update-ops` runs the same discovery and rewrites changed ids in `src/operations.json`. Run it before a release.

**Not discoverable:** operations whose scripts only load on a click (the following list's page 2, some composer queries, some menus). `update-ops` lists them; if one breaks, update it by hand as below.

### By hand

1. Open threads.com, DevTools → Network, filter `graphql`.
2. Trigger the feature (scroll, open a profile, search…).
3. Find the request whose `fb_api_req_friendly_name` matches the operation and copy its `doc_id` (and any new variables) into `src/operations.json`.
4. If the error is `execution error`, compare the `__relay_internal__pv__` keys in the browser request with `relayFlags.values` and add the missing ones.
