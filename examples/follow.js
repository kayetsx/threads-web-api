// Follow a user (by username or numeric ID).
import { threads } from './_session.js';

const status = await threads.follow('zuck');

if (status.outgoing_request) console.log('Follow request sent (private account, waiting for approval)');
else if (status.following) console.log('Followed @zuck');
else console.log('Follow failed: still not following @zuck');
