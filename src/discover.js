// Find current GraphQL doc_ids by operation name in threads.com's JavaScript.
// Each persisted query ships as a tiny module:
//   __d("BarcelonaFeedPaginationDirectQuery_threadsRelayOperation",[],(function(t,n,r,o,a,i){a.exports="28828968350087565"}),null);

const MODULE_RE = /__d\("(\w+)_threadsRelayOperation",\[\],\(function\([^)]*\)\{\w+\.exports="(\d+)"\}/g;
// Mutations (like, follow, repost, block…) inline the id in their generated .graphql module instead:
//   params:{id:"26234294899535416",metadata:{},name:"useTHFollowMutationFollowMutation",operationKind:"mutation"
const PARAMS_RE = /params:\{id:"(\d+)",metadata:\{[^}]*\},name:"(\w+)",operationKind:"\w+"/g;
const SCRIPT_RE = /https:\/\/static\.cdninstagram\.com\/rsrc\.php\/[^"'\s\\]+?\.js[^"'\s\\]*/g;

// Pages whose scripts cover the operations this library uses, most useful first. Operations whose
// scripts only load on a click aren't found this way and keep their operations.json doc_id.
export const DISCOVERY_PAGES = [
  '/', '/@zuck', '/@zuck/post/DeZtp-TkQHh', '/search?q=threads&serp_type=tags', '/activity',
  '/@zuck/replies', '/@zuck/media', '/@zuck/reposts', '/search', '/following',
];

/**
 * Scan pages for doc_ids. State ({ found, scripts, pagesDone }) can be passed back in to resume.
 * Stops early once `want` (an operation name) has been found.
 */
export async function discoverDocIds(threads, { want, state = { found: {}, scripts: new Set(), pagesDone: new Set() } } = {}) {
  for (const path of DISCOVERY_PAGES) {
    if (want && state.found[want]) break;
    if (state.pagesDone.has(path)) continue;
    const html = (await threads.page(path)).replaceAll('\\/', '/');
    const fresh = (html.match(SCRIPT_RE) ?? []).filter(u => !state.scripts.has(u));
    fresh.forEach(u => state.scripts.add(u));
    await Promise.all(fresh.map(async url => {
      const js = await threads.fetch(url).then(r => r.text()).catch(() => '');
      for (const [, name, id] of js.matchAll(MODULE_RE)) state.found[name] = id;
      for (const [, id, name] of js.matchAll(PARAMS_RE)) state.found[name] = id;
    }));
    state.pagesDone.add(path);
  }
  return state;
}
