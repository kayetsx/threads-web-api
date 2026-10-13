#!/usr/bin/env node
// Maintainer script: refresh doc_ids in src/operations.json from threads.com's current scripts.
// Usage: npm run update-ops   (needs session.json from `npm run login`)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Threads } from '../src/index.js';
import { discoverDocIds } from '../src/discover.js';

if (!existsSync('session.json')) {
  console.error('session.json not found. Run `npm run login` first.');
  process.exit(1);
}
const file = fileURLToPath(new URL('../src/operations.json', import.meta.url));
const ops = JSON.parse(readFileSync(file, 'utf8'));
const threads = new Threads(JSON.parse(readFileSync('session.json', 'utf8')));

const { found } = await discoverDocIds(threads);
console.log(`Found ${Object.keys(found).length} operations on threads.com\n`);

let text = readFileSync(file, 'utf8'), changed = 0;
const missing = [];
for (const [key, o] of Object.entries(ops.ops)) {
  const name = o.name ?? key, id = found[name];
  if (!id) { missing.push(name); continue; }
  if (id === o.doc_id) continue;
  // Replace in place so the file's hand formatting survives.
  text = text.replace(`"doc_id": "${o.doc_id}"`, `"doc_id": "${id}"`);
  console.log(`updated  ${name}: ${o.doc_id} -> ${id}`);
  changed++;
}
if (changed) writeFileSync(file, text);
console.log(`\n${changed} updated, ${Object.keys(ops.ops).length - changed - missing.length} unchanged, ${missing.length} not discoverable (loaded on click; check them manually if they break):`);
console.log('  ' + missing.join('\n  '));
