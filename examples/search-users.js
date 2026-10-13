import { threads } from './_session.js';

const users = await threads.searchUsers('umkm');
for (const u of users) {
  console.log(`@${u.username.padEnd(25)} ${String(u.follower_count ?? '').padStart(9)} followers  ${u.is_verified ? '✓' : ' '} ${u.full_name}`);
}
