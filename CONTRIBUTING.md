# Contributing

## Setup

```sh
npm install
npm test            # offline tests, no account needed
npm run login       # creates session.json for trying things live
```

## Adding an operation

1. Capture it from threads.com in DevTools → Network (filter `graphql`). Note `fb_api_req_friendly_name`, `doc_id`, the endpoint (`/api/graphql` or `/graphql/query`) and the variables.
2. Add it to `src/operations.json` → `ops`.
3. Wrap it in the matching file in `src/modules/` and call it with `this.op(name, variables)`. Return `{ items, next }` for anything paginated (use `page()` from `client.js`).
4. Add it to the API table in `README.md`.

If it fails with `execution error`, the browser request has relay flags we don't send yet. Add them to `relayFlags.values`.

## Releasing

1. `npm test` (offline) and `npm run smoke` (live, read-only). Both must pass.
2. `npm run update-ops`. Commit any refreshed doc_ids.
3. Add the release to `CHANGELOG.md`.
4. `npm version minor` (or `patch`), then `git push --follow-tags`. The Publish workflow tests and publishes the tag to GitHub Packages.

## Pull requests

- Never commit `session.json`, cookies or tokens. When pasting captured requests into issues or PRs, remove `fb_dtsg`, `lsd`, `sessionid`, `enc_password` and the like.
- Keep `npm test` passing. Tests must stay offline.
- Keep dependencies minimal. Node's built-ins (`fetch`, `crypto`, `node:test`) come first.
