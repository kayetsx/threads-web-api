import { ProxyAgent } from 'undici';

// Pass to `new Threads(cookies, { fetch: proxyFetch(url) })` to route all requests through a proxy.
// url: 'http://user:pass@host:port' (http/https/socks5 proxies all work).
export function proxyFetch(url) {
  const dispatcher = new ProxyAgent(url);
  return (input, init = {}) => fetch(input, { ...init, dispatcher });
}
