/**
 * Mage web search (P5) — pure, client-safe helpers for the OpenRouter web
 * plugin. No db, no server-only imports: sanitizing provider annotations and
 * deciding whether a message is worth searching are both plain data-in/data-out
 * functions, reusable on client and server.
 */

export interface MageWebLink {
  /** Full sanitized http(s) URL. */
  url: string;
  /** Display hostname (e.g. "nature.com"), derived from the URL. */
  hostname: string;
  /** Plain-text title if present, HTML/markup stripped. Omitted when empty. */
  title?: string;
}

const MAX_LINKS = 8;
const MAX_TITLE_LEN = 120;

/**
 * Sanitize raw OpenRouter web-plugin annotations into a compact, safe link list
 * for rendering. Input is untrusted provider JSON (unknown[]). OpenRouter web
 * citations look like:
 *   { type: 'url_citation', url_citation: { url, title, content, start_index, end_index } }
 * Rules: http/https ONLY (drop everything else); derive hostname via URL();
 * strip any HTML tags from the title and trim/cap it (~120 chars); dedupe by
 * url; cap the result to 8 links. Never throw on malformed input.
 */
export function sanitizeWebAnnotations(annotations: unknown[]): MageWebLink[] {
  const seen = new Set<string>();
  const links: MageWebLink[] = [];

  for (const raw of annotations) {
    if (links.length >= MAX_LINKS) break;
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;

    const nested =
      item.url_citation && typeof item.url_citation === 'object'
        ? (item.url_citation as Record<string, unknown>)
        : undefined;

    const rawUrl = typeof nested?.url === 'string' ? nested.url : typeof item.url === 'string' ? item.url : undefined;
    if (!rawUrl) continue;

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;

    const url = parsed.toString();
    if (seen.has(url)) continue;

    const hostname = parsed.hostname.replace(/^www\./, '');

    const rawTitle =
      typeof nested?.title === 'string' ? nested.title : typeof item.title === 'string' ? item.title : undefined;
    const title = rawTitle
      ? rawTitle
          .replace(/<[^>]*>/g, '')
          .trim()
          .slice(0, MAX_TITLE_LEN)
      : undefined;

    seen.add(url);
    links.push(title ? { url, hostname, title } : { url, hostname });
  }

  return links;
}

/** Curated exact-match phrases that are content-free by themselves. */
const CONVERSATIONAL_PHRASES = new Set([
  'thanks',
  'thank you',
  'thanks!',
  'thank you!',
  'ty',
  'ok',
  'okay',
  'k',
  'got it',
  'gotcha',
  'cool',
  'nice',
  'great',
  'awesome',
  'perfect',
  'sounds good',
  'hi',
  'hey',
  'hello',
  'yo',
  'sup',
  'yes',
  'yep',
  'yup',
  'no',
  'nope',
  'lol',
  'haha',
  'nvm',
  'never mind',
]);

/** Short greeting/ack vocabulary — used for the "short message, no question" guard. */
const ACK_WORDS = new Set([
  'thanks',
  'thank',
  'you',
  'ty',
  'ok',
  'okay',
  'k',
  'got',
  'it',
  'gotcha',
  'cool',
  'nice',
  'great',
  'awesome',
  'perfect',
  'sounds',
  'good',
  'hi',
  'hey',
  'hello',
  'yo',
  'sup',
  'yes',
  'yep',
  'yup',
  'no',
  'nope',
  'lol',
  'haha',
  'nvm',
  'never',
  'mind',
  'bro',
  'dude',
  'man',
]);

/**
 * True when a user message is trivially conversational (a thank-you, greeting,
 * or tiny acknowledgement) and a web search would be pointless — so the caller
 * skips attaching the web plugin (no cost, no quota charge). Keep it tight and
 * conservative: only skip on clearly content-free messages.
 */
export function isTriviallyConversational(message: string): boolean {
  if (typeof message !== 'string') return false;

  // Strip emoji/symbols and trailing punctuation, collapse whitespace.
  const cleaned = message
    .trim()
    .toLowerCase()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[!.?,;:]+$/g, '')
    .trim();

  if (!cleaned) return true; // whitespace/emoji-only, e.g. "👍"

  if (CONVERSATIONAL_PHRASES.has(cleaned)) return true;

  if (message.includes('?')) return false; // any real question always searches

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  if (words.length > 3) return false;

  return words.every((w) => ACK_WORDS.has(w));
}
