export type Cookies = Record<string, string>;

export interface ThreadsOptions {
  /** Custom fetch, e.g. one that goes through a proxy. Default: globalThis.fetch */
  fetch?: typeof fetch;
  /** Retries on rate limits and 5xx. Default 3 */
  retries?: number;
  /** First backoff delay in ms, doubled each retry. Default 2000 */
  retryDelay?: number;
  /** When a query fails because Meta rotated its doc_id, look up the new one and retry. Default true */
  autoUpdate?: boolean;
  /** Minimum ms between requests to threads.com; concurrent calls queue. Default 1000, 0 = off */
  minInterval?: number;
  /** JSON file that keeps rediscovered doc_ids between runs, so a restart skips the 2-5 s rescan. Default: none */
  cacheFile?: string;
}

/** A paginated result. Pass `next` back as `after` for the next page; null on the last page. */
export interface Page<T> {
  items: T[];
  next: string | null;
}

export interface PageOptions {
  after?: string | null;
  /** A hint; the server decides the real page size. */
  first?: number;
}

/** Raw user object from Threads (only the common fields are typed). */
export interface User {
  pk: string;
  id: string;
  username: string;
  full_name?: string;
  is_verified?: boolean;
  biography?: string;
  follower_count?: number;
  profile_pic_url?: string;
  hd_profile_pic_versions?: { url: string; width: number; height: number }[];
  text_post_app_is_private?: boolean;
  friendship_status?: FriendshipStatus;
  [key: string]: unknown;
}

/** Raw post object from Threads (only the common fields are typed). */
export interface Post {
  pk: string;
  id: string;
  code: string;
  user: User;
  caption?: { text: string } | null;
  taken_at: number;
  like_count?: number;
  has_liked?: boolean;
  /** 1 image, 2 video, 8 carousel, 19 text */
  media_type?: number;
  image_versions2?: { candidates: { url: string; width: number; height: number }[] };
  video_versions?: { url: string; type?: number }[];
  carousel_media?: Post[] | null;
  text_post_app_info?: {
    direct_reply_count?: number;
    repost_count?: number;
    quote_count?: number;
    reshare_count?: number;
    is_reply?: boolean;
    share_info?: { reposted_post?: Post | null; quoted_post?: Post | null };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** A thread: the post plus any self-replies (thread_items[0].post is the main post). */
export interface Thread {
  id: string;
  thread_items: { post: Post }[];
  [key: string]: unknown;
}

/** A reply chain: [direct reply, ...replies nested under it]. */
export type ReplyChain = Post[];

export interface FriendshipStatus {
  following: boolean;
  /** true = follow request pending (private account) */
  outgoing_request: boolean;
  [key: string]: unknown;
}

export interface PostActivity {
  user: User;
  /** Unix seconds */
  timestamp: number;
  /** Quote text (quotes only) */
  text: string | null;
  url: string | null;
}

export type NotificationFilter = 'all' | 'follows' | 'replies' | 'mentions' | 'quotes' | 'reposts';

export interface Notification {
  id: string;
  /** e.g. text_post_app_like, text_post_app_repost, text_post_app_insights */
  type: string;
  title: string;
  text: string;
  timestamp: number;
  users: string[];
  images: string[];
  url: string | null;
}

export type ReplyControl = 'everyone' | 'following' | 'mentioned' | 0 | 1 | 2;
/** A file path or the file's bytes. */
export type MediaInput = string | Uint8Array;

export interface PublishOptions {
  /** JPEG, PNG or WebP; an array makes a carousel. */
  image?: MediaInput | MediaInput[];
  /** Photos and videos mixed, in order (a carousel when more than one). */
  media?: MediaInput[];
  /** One MP4. */
  video?: MediaInput;
  /** Alt text; an array matches a carousel's images. */
  alt?: string | string[];
  /** URL shown as a link preview card (dropped when quoting). */
  link?: string;
  /** 2–4 options; text posts only. */
  poll?: string[];
  /** Topic tag, e.g. 'JavaScript'. */
  topic?: string;
  /** Post ID, URL or shortcode. */
  replyTo?: string;
  /** Post ID, URL or shortcode. */
  quote?: string;
  /** Default 'everyone'. */
  replyControl?: ReplyControl;
}

export interface ScheduledPost {
  /** Draft id; pass to cancelScheduledPost. */
  id: string;
  /** Unix seconds. */
  scheduled_time: number;
}

export interface LikeStatus {
  has_liked: boolean;
  like_count: number;
}

export interface SearchPostsOptions extends PageOptions {
  /** URL serp_type: 'default' or 'tags' */
  type?: 'default' | 'tags' | string;
  tagID?: string | null;
  /** true = "Recent" tab, false = "Top" */
  recent?: boolean;
}

export class Threads {
  constructor(cookies?: Cookies | string, options?: ThreadsOptions);
  /** Session cookies; save them (e.g. to session.json) to reuse the login. */
  cookies: Cookies;
  readonly userId: string | undefined;

  login(username: string, password: string): Promise<{ authenticated: true; userId: string; [key: string]: unknown }>;

  getUserProfile(username: string): Promise<User>;
  getUserIDfromUsername(username: string): Promise<string>;
  getUserProfileThreads(userID: string, options?: PageOptions): Promise<Page<Thread>>;
  getUserProfileReplies(userID: string, options?: PageOptions): Promise<Page<Thread>>;
  getUserProfileMedia(userID: string, options?: PageOptions): Promise<Page<Thread>>;
  /** First page only for now. */
  getUserProfileReposts(userID: string, options?: PageOptions): Promise<Page<Thread>>;

  getUserProfileByID(userID: string): Promise<User>;
  /** The logged-in account's full profile. */
  me(): Promise<User>;
  /** Other users: Meta returns a ~50 sample, next is null. */
  getUserFollowers(userID: string, options?: { first?: number }): Promise<Page<User>>;
  /** Fully paginated; page size capped at 20. */
  getUserFollowing(userID: string, options?: PageOptions): Promise<Page<User>>;

  getFeed(options?: PageOptions): Promise<Page<Thread>>;
  getFollowingFeed(options?: PageOptions): Promise<Page<Thread>>;

  /** Samples (~100) of who liked / reposted / quoted a post. */
  getPostLikers(post: string): Promise<PostActivity[]>;
  getPostReposters(post: string): Promise<PostActivity[]>;
  getPostQuotes(post: string): Promise<PostActivity[]>;

  getNotifications(options?: { filter?: NotificationFilter; after?: string | null; first?: number }): Promise<Page<Notification>>;

  /** Post ID, URL or shortcode. */
  getThreads(post: string): Promise<Post>;
  getReplies(post: string, options?: PageOptions & { sortOrder?: 'TOP' | string }): Promise<Page<ReplyChain>>;
  like(post: string): Promise<LikeStatus>;
  unlike(post: string): Promise<LikeStatus>;
  /** Publish a post; returns the new post. text may be '' when image or video is given. Never retried. */
  publish(text?: string, options?: PublishOptions): Promise<Post>;
  /** Post into a tag/topic (leading # optional). Same options as publish. */
  /** The composer's pre-post check for a tag name. */
  validateTag(tag: string): Promise<{ valid: boolean; sensitive: boolean }>;
  /** Post into a tag; any spelling Meta resolves works ('fashionthreads' lands in 'Fashion Threads'). */
  publishToTag(tag: string, text?: string, options?: Omit<PublishOptions, 'topic'>): Promise<Post>;
  /** Each post replies to the one before. Posts already published stay up if a later one fails. */
  publishThread(posts: (string | ({ text?: string } & Omit<PublishOptions, 'replyTo'>))[], options?: { replyTo?: string }): Promise<Post[]>;
  /** Schedule a post; Threads publishes it at `at`. quote / replyTo aren't supported. */
  schedulePost(text: string, options: { at: Date | number | string } & Omit<PublishOptions, 'replyTo' | 'quote'>): Promise<ScheduledPost>;
  /** Your scheduled posts, soonest first. */
  getScheduledPosts(): Promise<(ScheduledPost & { text: string; draft: Record<string, unknown> })[]>;
  cancelScheduledPost(id: string): Promise<{ deleted: boolean }>;
  /** Every draft, scheduled or not; scheduled_time is null for plain drafts. */
  getDrafts(): Promise<{ id: string; scheduled_time: number | null; text: string; draft: Record<string, unknown> }[]>;
  /** Save a draft without posting or scheduling it. replyTo / quote aren't supported. */
  saveDraft(text?: string, options?: Omit<PublishOptions, 'replyTo' | 'quote'>): Promise<{ id: string }>;
  deleteDraft(id: string): Promise<{ deleted: boolean }>;
  /** Edit one of your posts. Returns the edited post. */
  editPost(post: string, text: string, options?: { replyControl?: ReplyControl; topic?: string }): Promise<Post>;
  /** Your own post; permanent. */
  deletePost(post: string): Promise<{ did_delete: boolean }>;
  repost(post: string): Promise<{ reposted: boolean; repost_count: number }>;
  deleteRepost(post: string): Promise<{ reposted: false }>;

  searchUsers(query: string, options?: { first?: number }): Promise<User[]>;
  /** "Suggested for you" on the search page: ~15 users, no paging. */
  getRecommendedUsers(): Promise<User[]>;
  searchPosts(query: string, options?: SearchPostsOptions): Promise<Page<Thread>>;
  searchTags(tag: string, options?: Omit<SearchPostsOptions, 'type'>): Promise<Page<Thread>>;

  /** Username (with or without @) or numeric user ID. */
  follow(user: string): Promise<FriendshipStatus>;
  unfollow(user: string): Promise<FriendshipStatus>;
  /** Blocking also removes follows in both directions. */
  block(user: string): Promise<{ blocking: true }>;
  unblock(user: string): Promise<{ blocking: false }>;
  mute(user: string): Promise<{ muting: boolean }>;
  unmute(user: string): Promise<{ muting: boolean }>;
  restrict(user: string): Promise<{ restricted: true }>;
  unrestrict(user: string): Promise<{ restricted: false }>;

  /** Iterate items across pages: for await (const t of threads.paginate(after => threads.getFeed({ after }))) */
  paginate<T>(fetchPage: (after: string | null) => Promise<Page<T>>, options?: { maxPages?: number; delay?: number }): AsyncGenerator<T>;

  /** doc_ids discovered at runtime (operation name -> id); they override operations.json. */
  docIds: Record<string, string>;
  /**
   * Look up current doc_ids in threads.com's scripts (pages already scanned are skipped unless force).
   * Returns the operations whose doc_id differs from the bundled operations.json.
   */
  updateOperations(options?: { want?: string; force?: boolean }): Promise<{ name: string; from: string; to: string }[]>;

  /** Raw GraphQL call for operations without a wrapper. */
  graphql<T = any>(name: string, docId: string, variables?: Record<string, unknown>, path?: string): Promise<T>;
}

export interface SimplePost {
  id: string;
  code: string;
  url: string;
  text: string;
  author: { id: string; username: string; fullName: string | null; verified: boolean; avatar: string | null };
  createdAt: string;
  type: 'image' | 'video' | 'carousel' | 'text';
  media: ({ type: 'image'; url: string } | { type: 'video'; url: string; thumbnail: string | null })[];
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  shares: number;
  isReply: boolean;
  hasLiked: boolean;
  repostOf: SimplePost | null;
  quoteOf: SimplePost | null;
}

export function simplifyPost(post: Post): SimplePost;

export interface SimpleUser {
  id: string;
  username: string;
  fullName: string | null;
  verified: boolean;
  private: boolean;
  bio: string;
  /** null when the query that returned the user doesn't carry a count */
  followers: number | null;
  avatar: string | null;
}
export function simplifyUser(user: User): SimpleUser;
export function getPostIDfromURL(urlOrShortcode: string): string;
export function encryptPassword(password: string, keyId: number, publicKeyHex: string, version?: string, timestamp?: string): Promise<string>;
export function jazoest(token: string): string;
/** Custom fetch that routes every request through a proxy, for the `fetch` ThreadsOptions. url: 'http://user:pass@host:port' (http/https/socks5). */
export function proxyFetch(url: string): typeof fetch;

export class ThreadsError extends Error {
  status?: number;
  response?: unknown;
}
export class SessionExpiredError extends ThreadsError {}
export class RateLimitError extends ThreadsError {}
export class NotFoundError extends ThreadsError {}
export class LoginError extends ThreadsError {}
