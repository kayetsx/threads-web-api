import { readFile } from 'node:fs/promises';
import { page } from '../client.js';
import { NotFoundError, ThreadsError } from '../errors.js';

// Post URL or shortcode -> numeric post ID. Shortcodes are base64 (URL-safe alphabet) of the ID.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export function getPostIDfromURL(urlOrCode) {
  const code = urlOrCode.match(/\/post\/([\w-]+)/)?.[1] ?? urlOrCode;
  return [...code].reduce((n, c) => n * 64n + BigInt(ALPHABET.indexOf(c)), 0n).toString();
}

// Accepts a post ID, a post URL or a shortcode.
const toPostID = post => /^\d+$/.test(post) ? post : getPostIDfromURL(post);

async function postActivity(threads, post, tab_type) {
  const d = await threads.op('BarcelonaFeedbackHubTabQuery', { post_id: toPostID(post), sort_type: 'default', tab_type });
  return d.feedback_hub_tab_items.edges.map(({ node: n }) => ({
    user: n.actor,
    timestamp: n.timestamp,
    text: n.extra?.content || null,
    url: n.destination ?? null,
  }));
}

// Millisecond timestamp, bumped so two calls in the same ms differ (as the web composer does).
let lastUploadID = 0;
const uploadID = () => String(lastUploadID = Math.max(Date.now(), lastUploadID + 1));

/**
 * Media bytes -> { kind: 'image' | 'video', type, width, height }. rupload wants the dimensions up front.
 * Images: JPEG, PNG, WebP. Video: MP4/MOV (size from the first track header that has one).
 */
export function mediaInfo(b) {
  const image = (type, width, height) => ({ kind: 'image', type, width, height });
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return image('image/png', b.readUInt32BE(16), b.readUInt32BE(20));
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length && b[i] === 0xff;) {
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; } // fill byte
      // SOF0–SOF15 carry the frame size; C4 (DHT), C8, CC (DAC) share the range but don't.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return image('image/jpeg', b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
    const chunk = b.toString('latin1', 12, 16);
    if (chunk === 'VP8 ') return image('image/webp', b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return image('image/webp', (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
    }
    if (chunk === 'VP8X') return image('image/webp', b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
  }
  if (b.toString('latin1', 4, 8) === 'ftyp') {
    // ponytail: byte scan for 'tkhd' instead of walking the box tree; fine for real files.
    for (let i = b.indexOf('tkhd'); i > 0; i = b.indexOf('tkhd', i + 4)) {
      const at = i + 4 + (b[i + 4] === 1 ? 88 : 76); // version 1 has 64-bit times
      const width = b.readUInt32BE(at) >>> 16, height = b.readUInt32BE(at + 4) >>> 16;
      if (width && height) return { kind: 'video', type: 'video/mp4', width, height };
    }
  }
  throw new TypeError('media must be a JPEG, PNG, WebP or MP4');
}

// Upload a photo or video to rupload; returns the upload_id that configure_* attaches to a post.
async function upload(threads, file, sidecar) {
  const buf = typeof file === 'string' ? await readFile(file) : Buffer.from(file);
  const { kind, type, width, height } = mediaInfo(buf);
  const upload_id = uploadID(), name = `fb_uploader_${upload_id}`;
  const common = { is_sidecar: sidecar ? '1' : '0', is_threads: '1', upload_id, upload_media_height: height, upload_media_width: width };
  const params = kind === 'video' ? { extract_cover_frame: '1', ...common, media_type: 2 } : { ...common, media_type: 1 };
  const j = await threads.rest('upload', `/rupload_ig${kind === 'video' ? 'video' : 'photo'}/${name}`, {
    body: buf,
    headers: {
      'content-type': type, offset: '0', 'x-entity-length': String(buf.length), 'x-entity-name': name, 'x-entity-type': type,
      'x-instagram-rupload-params': JSON.stringify(params),
    },
  });
  // Photos answer with the upload_id to use; videos answer { media_id } and keep ours.
  return { id: j.upload_id ?? upload_id, kind };
}

const REPLY_CONTROL = { everyone: 0, following: 1, mentioned: 2 };
function replyControlValue(rc) {
  const v = typeof rc === 'number' ? rc : REPLY_CONTROL[rc];
  if (![0, 1, 2].includes(v)) throw new TypeError(`replyControl must be 'everyone', 'following' or 'mentioned', got ${rc}`);
  return v;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// publish / schedulePost media options -> files in order: media (mixed), then image, then video.
function mediaFiles(text, { media, image, video, poll }, name) {
  const files = [media ?? [], image ?? [], video ?? []].flat();
  if (!text && !files.length) throw new TypeError(`${name}: text, image or video required`);
  if (poll && files.length) throw new TypeError(`${name}: polls are text-only`);
  return files;
}

async function uploadAll(threads, files) {
  const uploads = [];
  for (const f of files) uploads.push(await upload(threads, f, files.length > 1));
  return uploads;
}

// Draft (scheduled post) reply control is an uppercase enum.
const DRAFT_REPLY_CONTROL = ['EVERYONE', 'ACCOUNTS_YOU_FOLLOW', 'MENTIONED_ONLY'];

// Save a draft (what the composer's "Save draft" does); returns its id.
async function createDraft(threads, text, { uploads, alts, link, poll, topic, reply_control }) {
  const captions = uploads.flatMap((u, i) => alts[i] ? [{ attachment_upload_id: u.id, caption: alts[i] }] : []);
  const d = await threads.op('useTHDraftCreateMutationMutation', {
    draft_thread_items: [{
      text,
      attachment_upload_ids: uploads.map(u => u.id),
      custom_accessibility_caption: captions.length ? { media_custom_accessibility_captions_by_attachment: captions } : null,
      link_attachment_url: link ?? null,
      poll_attachment: poll ? { options: poll.map((t, i) => ({ placeholder: `Option ${i + 1}`, text: t })) } : null,
      tag_header: topic ? { display_text: topic } : null,
      is_add_music_post: false, is_dm_me_post: false, is_genai_invocation_post: false, is_join_me_post: false,
      is_paid_partnership: false, is_spoiler_media: false,
    }],
    reply_control, is_meta_only: false, is_threads_buddies_post: false, limit_by_region: [],
    fediverse_composer_enabled: true, is_reply_approval_enabled: false,
  });
  return d.xth_create_draft_thread.draft_thread.id;
}

const LIKE_REQUEST_DATA = {
  barcelona_source_reply_id_str: null, container_module: 'ig_text_feed_profile', logging_info_token: null,
  nav_chain: null, query_text: null, search_session_id: null,
};

export default {
  // Returns { has_liked, like_count } after the action.
  async like(post) {
    const { record } = await this.op('useTHLikeMutationLikeMutation', { mediaID: toPostID(post), requestData: LIKE_REQUEST_DATA });
    return { has_liked: record.media.has_liked, like_count: record.media.like_count };
  },

  async unlike(post) {
    const { record } = await this.op('useTHLikeMutationUnlikeMutation', { mediaID: toPostID(post), requestData: LIKE_REQUEST_DATA });
    return { has_liked: record.media.has_liked, like_count: record.media.like_count };
  },

  /**
   * Publish a post; returns the new post (media). text may be empty when image or video is given.
   * image: file path, Buffer or Uint8Array (JPEG, PNG, WebP), or an array of them for a carousel.
   * video: one MP4 (path or bytes). media: photos and videos mixed, in order, for a carousel.
   * alt: alt text, or an array matching a carousel's items.
   * link: URL for a preview card. poll: 2–4 option strings (text posts only). topic: topic tag, e.g. 'JavaScript'.
   * replyTo / quote take a post ID, URL or shortcode. replyControl: 'everyone' | 'following' | 'mentioned'.
   * @mentions need no option: write them in the text.
   * Same REST calls the threads.com composer makes. Not retried: a retry after a lost response could double-post.
   */
  async publish(text = '', { media, image, video, alt, link, poll, topic, replyTo, quote, replyControl = 'everyone' } = {}) {
    const files = mediaFiles(text, { media, image, video, poll }, 'publish');
    const reply_control = replyControlValue(replyControl);
    const alts = [alt ?? []].flat();
    const sidecar = files.length > 1;
    const uploads = await uploadAll(this, files);
    const reply_id = replyTo ? toPostID(replyTo) : undefined;
    const quoted_post_id = quote ? toPostID(quote) : undefined;
    const fields = {
      audience: 'default',
      barcelona_source_reply_id: reply_id,
      caption: text,
      caption_add_on: poll ? JSON.stringify({ poll: { question: '?', tallies: poll.map(t => ({ text: t })) } }) : undefined,
      creator_geo_gating_info: '{"whitelist_country_codes":[]}',
      internal_features: '',
      should_include_permalink: 'true',
      text_post_app_info: JSON.stringify({
        ...(sidecar && { carousel_experience: 'legacy', carousel_item_count: files.length, fallback_or_rejection_category: 'none' }),
        excluded_inline_media_ids: '[]', is_reply_approval_enabled: false,
        // A quote card takes the attachment slot, so the composer drops the link preview.
        link_attachment_url: quoted_post_id ? undefined : link,
        quoted_post_id, reply_control, reply_id,
        tag_header: topic ? { display_text: topic } : null,
        text_with_entities: { entities: [], text },
      }),
    };
    let configure;
    if (sidecar) {
      // The carousel endpoint takes a JSON body, sent as text/plain like the browser does:
      // with content-type application/json Meta answers { status: 'fail', message: '' }.
      configure = () => this.rest('publish', '/api/v1/media/configure_text_post_app_sidecar/', {
        headers: { 'content-type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          ...fields, is_threads: true, is_upload_type_override_allowed: '1', should_include_permalink: true,
          client_sidecar_id: uploadID(),
          children_metadata: uploads.map((u, i) => ({ upload_id: u.id, custom_accessibility_caption: alts[i] })),
        }),
      });
    } else {
      const form = {
        ...fields, upload_id: uploads[0]?.id ?? uploadID(), custom_accessibility_caption: alts[0],
        ...(files.length ? { is_threads: 'true' } : { publish_mode: 'text_post' }),
      };
      const path = files.length ? '/api/v1/media/configure_text_post_app_feed/' : '/api/v1/media/configure_text_only_post/';
      const body = new URLSearchParams(Object.entries(form).filter(([, v]) => v !== undefined));
      configure = () => this.rest('publish', path, { body });
    }
    // A video can't be configured until Meta finishes transcoding it. That failure means nothing was
    // posted, so retrying it (and only it) is safe. Gives up after about a minute.
    let j;
    for (let tries = 0; ; tries++) {
      try { j = await configure(); break; }
      catch (e) {
        if (!uploads.some(u => u.kind === 'video') || !/transcod|not finished|processing/i.test(e.message) || tries >= 12) throw e;
        await sleep(5000);
      }
    }
    if (!j.media) throw new ThreadsError('publish: no media in response', { response: j });
    return j.media;
  },

  // { valid, sensitive } for a tag name, the check the composer runs before posting into it.
  async validateTag(tag) {
    const { xdt_text_app_tags_validate: r } = await this.op('BarcelonaTagsUtilsQuery', { tag_name: tag.replace(/^#/, '') });
    return { valid: r.is_valid, sensitive: r.is_sensitive };
  },

  // Post into a tag/topic (leading # optional, any spelling Meta resolves: 'fashionthreads' lands in the
  // 'Fashion Threads' community tag). Same options as publish: text, image, video, media, replyTo, ...
  publishToTag(tag, text = '', options = {}) {
    return this.publish(text, { ...options, topic: tag.replace(/^#/, '') });
  },

  /**
   * Publish a multi-post thread: each post replies to the one before, like the composer's "Add to thread".
   * posts: strings or { text, ...publish options }. Returns the posts in order. If one fails, the ones
   * before it stay published (delete them with deletePost if needed).
   */
  async publishThread(posts, { replyTo } = {}) {
    const out = [];
    for (const p of posts) {
      const { text = '', ...opts } = typeof p === 'string' ? { text: p } : p;
      out.push(await this.publish(text, { ...opts, replyTo: out.at(-1)?.pk ?? replyTo }));
    }
    return out;
  },

  /**
   * Schedule a post: Threads stores it as a draft and publishes it at `at` (Date, ms timestamp or date
   * string, in the future). Same options as publish except replyTo and quote (Meta drops quotes from
   * scheduled drafts). Returns { id, scheduled_time } where
   * id is the draft id for cancelScheduledPost and scheduled_time is in unix seconds.
   */
  async schedulePost(text = '', { at, media, image, video, alt, link, poll, topic, quote, replyTo, replyControl = 'everyone' } = {}) {
    if (quote || replyTo) throw new TypeError('schedulePost: quote and replyTo are not supported for scheduled posts');
    const time = Math.floor(new Date(at).getTime() / 1000);
    if (!(time > Date.now() / 1000)) throw new TypeError('schedulePost: `at` must be a future date');
    const files = mediaFiles(text, { media, image, video, poll }, 'schedulePost');
    const reply_control = DRAFT_REPLY_CONTROL[replyControlValue(replyControl)];
    const uploads = await uploadAll(this, files);
    const alts = [alt ?? []].flat();
    const id = await createDraft(this, text, { uploads, alts, link, poll, topic, reply_control });
    try {
      const { xdt_text_app_schedule_draft: r } = await this.op('useTHSchedulePostMutationMutation', {
        input: { client_mutation_id: '1', draft_id: id, schedule_publish_state: 'SCHEDULED', schedule_publish_time: time },
      });
      if (!r?.success) throw new ThreadsError('schedulePost: Meta did not confirm the schedule', { response: r });
      return { id, scheduled_time: r.schedule_publish_time };
    } catch (e) {
      // Don't leave an unscheduled draft behind.
      await this.cancelScheduledPost(id).catch(() => {});
      throw e;
    }
  },

  // All your drafts, scheduled or not: [{ id, scheduled_time (unix seconds, or null), text, draft (raw) }].
  async getDrafts() {
    const d = await this.op('BarcelonaComposerDraftsDialogDraftsQuery', {});
    return d.xth_threads_viewer.drafts.nodes.map(n => ({
      id: n.id,
      scheduled_time: n.schedule_publish_status === 'SCHEDULED' ? n.schedule_publish_time : null,
      text: n.draft_thread_items.nodes[0]?.text ?? '',
      draft: n,
    }));
  },

  // Your scheduled posts, soonest first: [{ id, scheduled_time (unix seconds), text, draft (raw) }].
  async getScheduledPosts() {
    return (await this.getDrafts()).filter(d => d.scheduled_time != null).sort((a, b) => a.scheduled_time - b.scheduled_time);
  },

  // Save a draft without posting or scheduling it. Same media options as publish (no replyTo / quote). Returns { id }.
  async saveDraft(text = '', { media, image, video, alt, link, poll, topic, replyControl = 'everyone' } = {}) {
    const files = mediaFiles(text, { media, image, video, poll }, 'saveDraft');
    const reply_control = DRAFT_REPLY_CONTROL[replyControlValue(replyControl)];
    const uploads = await uploadAll(this, files);
    return { id: await createDraft(this, text, { uploads, alts: [alt ?? []].flat(), link, poll, topic, reply_control }) };
  },

  // Delete a draft (a scheduled one stops being scheduled). Returns { deleted: true }.
  deleteDraft(id) { return this.cancelScheduledPost(id); },

  // Cancel a scheduled post (deletes its draft). Returns { deleted: true }.
  async cancelScheduledPost(id) {
    const { record } = await this.op('useBarcelonaDraftDeleteMutationMutation', { draft_thread_id: String(id) });
    return { deleted: record.deleted_id === String(id) };
  },

  // Edit the text (and optionally reply control / topic) of one of your posts. Returns the edited post.
  async editPost(post, text, { replyControl = 'everyone', topic } = {}) {
    const d = await this.op('useBarcelonaComposerEditPostMutation', {
      mediaID: toPostID(post), caption: text, textWithEntities: { entities: [], text },
      // GraphQL wants the enum name ('everyone', 'accounts_you_follow', 'mentioned_only'), REST the number.
      replyControl: ['everyone', 'accounts_you_follow', 'mentioned_only'][replyControlValue(replyControl)],
      tagHeader: topic ? { display_text: topic } : null,
      genAIDetectionMethod: 'NONE', isPaidPartnership: false, isReplyApprovalEnabled: false, removeLinkAttachment: false, specialEffect: '',
      // Sent alone (relayFlags: false in operations.json): the full flag set makes this mutation fail.
      __relay_internal__pv__BarcelonaHasDearAlgoConsumptionrelayprovider: true,
      __relay_internal__pv__BarcelonaHasDearAlgoWebProductionrelayprovider: false,
    });
    return d.record?.media ?? d;
  },

  // Returns { reposted, repost_count }.
  async repost(post) {
    const { record } = await this.op('useTHCreateRepostMutation', { mediaID: toPostID(post) });
    const info = record.repost.text_post_app_info.share_info.reposted_post.text_post_app_info;
    return { reposted: info.share_info.is_reposted_by_viewer, repost_count: info.repost_count };
  },

  // Meta's reply carries no state, so this returns { reposted: false } once the call succeeds.
  async deleteRepost(post) {
    await this.op('useTHDeleteRepostMutation', { mediaID: toPostID(post) });
    return { reposted: false };
  },

  // Delete one of your own posts. Permanent. Returns { did_delete }; Meta has answered false for a video
  // post it did remove, so check with getThreads (NotFoundError = gone) if it matters.
  deletePost(post) { return this.op('useTHDeletePostMutation', { mediaID: toPostID(post) }); },

  // Accepts a post ID, URL or shortcode.
  async getThreads(post) {
    const postID = toPostID(post);
    try {
      const { media } = await this.op('BarcelonaPostPageTargetQuery', { postID });
      if (!media) throw new NotFoundError(`post not found: ${post}`);
      return media;
    } catch (e) {
      // Meta answers unknown post IDs with a generic field_exception.
      if (/field_exception/.test(e.message)) throw new NotFoundError(`post not found: ${post}`, { response: e.response });
      throw e;
    }
  },

  // Who liked / reposted / quoted a post. Meta returns a sample (~100), not the full list.
  // Each item: { user, timestamp, text (quote text for quotes), url }.
  async getPostLikers(post) { return postActivity(this, post, 'like'); },
  async getPostReposters(post) { return postActivity(this, post, 'repost'); },
  async getPostQuotes(post) { return postActivity(this, post, 'quote'); },

  async getReplies(post, { after = null, first = 10, sortOrder = 'TOP' } = {}) {
    const postID = toPostID(post);
    const d = after
      ? await this.op('BarcelonaPostPageDirectRepliesRefetchQuery', { postID, after, first, filterType: null, sortOrder })
      : await this.op('BarcelonaPostPageDownwardQuery', { postID, sortOrder });
    // Each item is a reply chain: [directReply, ...replies shown nested under it].
    return page(d.media.text_post_app_info.direct_replies, e => e.node.posts.edges.map(x => x.node));
  },
};
