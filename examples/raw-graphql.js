// Call any GraphQL operation directly, even ones without a wrapper method.
// Find name + doc_id in DevTools → Network → graphql, or in src/operations.json.
import { threads } from './_session.js';

// Live like/reply/repost counts for a batch of posts.
const data = await threads.graphql(
  'useBarcelonaBatchedDynamicPostCountsSubscriptionQuery',
  '28194699753490791',
  { post_ids: ['4006434140014576097'] },
);
console.log(JSON.stringify(data, null, 2).slice(0, 800));
