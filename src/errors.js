export class ThreadsError extends Error {
  constructor(message, extra = {}) {
    super(message);
    this.name = new.target.name;
    Object.assign(this, extra);
  }
}

// Session cookies are missing, expired or logged out: run login again.
export class SessionExpiredError extends ThreadsError {}

// Meta is throttling this account/IP. Retried automatically; thrown once retries run out.
export class RateLimitError extends ThreadsError {}

// The user or post doesn't exist (or isn't visible to this account).
export class NotFoundError extends ThreadsError {}

// Login rejected: wrong password, 2FA or checkpoint required. `response` holds Meta's reply.
export class LoginError extends ThreadsError {}
