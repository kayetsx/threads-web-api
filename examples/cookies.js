// Get the session cookies after login, and log in with cookies (no password).
import { Threads } from '@kayetsx/threads-web-api';

// Get cookies: log in once, then read threads.cookies
const threads = new Threads();
await threads.login('your_username', 'your_password');
const cookies = threads.cookies;
console.log(cookies); // { sessionid, csrftoken, ds_user_id, mid, ... } save these

// Login with cookies: pass them to new Threads()
const again = new Threads(cookies);
// or an object you wrote yourself:
//   new Threads({ sessionid: '...', csrftoken: '...', ds_user_id: '...' })
// or the cookie string copied from your browser
// (threads.com → DevTools → Network → any request → Request Headers → cookie):
//   new Threads('sessionid=...; csrftoken=...; ds_user_id=...')

const me = await again.me();
console.log(`Logged in as @${me.username}`);
