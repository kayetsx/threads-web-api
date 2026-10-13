#!/usr/bin/env node
// Usage: npm run login [-- username [password]]   (anything missing is prompted for)
// Set PROXY=http://user:pass@host:port to log in through a proxy.
// Writes session.json in the current directory.
import { createInterface } from 'node:readline/promises';
import { writeFileSync, chmodSync } from 'node:fs';
import { Threads, proxyFetch } from '../src/index.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const username = process.argv[2] || await rl.question('Username: ');
let password = process.argv[3];
if (!password) {
  rl._writeToOutput = s => rl.output.write(s.startsWith('Password') ? s : '*'); // mask typing
  password = await rl.question('Password: ');
  rl.output.write('\n');
}
rl.close();

const t = new Threads({}, process.env.PROXY ? { fetch: proxyFetch(process.env.PROXY) } : {});
const r = await t.login(username, password);
writeFileSync('session.json', JSON.stringify(t.cookies, null, 2), { mode: 0o600 });
chmodSync('session.json', 0o600); // mode is ignored when the file already exists
const me = await t.getUserProfile(username);
console.log(`Logged in as @${me.username} (${r.userId}). Session saved to session.json — keep it private.`);
