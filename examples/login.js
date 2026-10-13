// Log in from code and save the session.
import { writeFileSync } from 'node:fs';
import { Threads } from '@kayetsx/threads-web-api';

const threads = new Threads();
const res = await threads.login('your_username', 'your_password');
writeFileSync('session.json', JSON.stringify(threads.cookies, null, 2));
console.log(`Logged in as ${res.userId}, session saved to session.json`);

// Next time, skip login:
//   const threads = new Threads(JSON.parse(readFileSync('session.json', 'utf8')));
