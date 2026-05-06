import * as cheerio from 'cheerio';
import dns from 'dns/promises';

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSRFError';
  }
}

export interface UrlImportResult {
  title: string;
  textContent: string;
}

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const FETCH_TIMEOUT = 10_000; // 10s

/**
 * Check if an IP address belongs to a private/reserved range.
 */
function isPrivateIp(ip: string): boolean {
  // IPv6 loopback and private
  if (
    ip === '::1' ||
    ip === '::' ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('fe80')
  ) {
    return true;
  }

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  const v4Mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const v4 = v4Mapped ? v4Mapped[1] : ip;

  const parts = v4.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) {
    // Not a valid IPv4 — treat as potentially unsafe
    return true;
  }

  const [a, b] = parts;

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (CGN)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 198.18.0.0/15 (benchmark)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved)
  if (a >= 224) return true;

  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  'metadata',
  'instance-data',
]);

/**
 * Validate a URL for safety against SSRF attacks.
 * Returns the validated URL string, or throws SSRFError.
 */
export async function validateUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SSRFError('Invalid URL format');
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SSRFError('Only HTTP and HTTPS URLs are allowed');
  }

  // Block known dangerous hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SSRFError('This hostname is not allowed');
  }

  // Block the AWS/GCP/Azure metadata IP directly in the URL
  if (hostname === '169.254.169.254' || hostname === '[fd00:ec2::254]') {
    throw new SSRFError('Metadata service addresses are not allowed');
  }

  // DNS resolution check
  try {
    const { address } = await dns.lookup(hostname);
    if (isPrivateIp(address)) {
      throw new SSRFError('URL resolves to a private/reserved IP address');
    }
  } catch (err) {
    if (err instanceof SSRFError) throw err;
    throw new SSRFError(`Could not resolve hostname: ${hostname}`);
  }

  return parsed.toString();
}

/**
 * Fetch a URL and extract its main text content using cheerio.
 */
export async function importFromUrl(url: string): Promise<UrlImportResult> {
  const validatedUrl = await validateUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  let response: Response;
  try {
    response = await fetch(validatedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Notemage/1.0',
        Accept: 'text/html, application/xhtml+xml, */*',
      },
      redirect: 'follow',
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof SSRFError) throw err;
    const message = err instanceof Error ? err.message : 'Fetch failed';
    throw new Error(`Failed to fetch URL: ${message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`URL returned HTTP ${response.status}`);
  }

  // Check content-length if available
  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
    throw new Error('Response too large (exceeds 5MB)');
  }

  // Read body with size limit
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.byteLength;
      if (totalSize > MAX_RESPONSE_SIZE) {
        reader.cancel();
        throw new Error('Response too large (exceeds 5MB)');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const html = decoder.decode(Buffer.concat(chunks));

  // Parse with cheerio
  const $ = cheerio.load(html);

  // Remove non-content elements
  $(
    'script, style, nav, footer, header, aside, iframe, form, noscript, svg, [role="navigation"], [role="banner"], [role="contentinfo"]'
  ).remove();

  // Try to find main content area
  let contentEl = $('article');
  if (contentEl.length === 0) contentEl = $('main');
  if (contentEl.length === 0) contentEl = $('[role="main"]');
  if (contentEl.length === 0) contentEl = $('body');

  // Extract title
  let title = $('title').first().text().trim();
  if (!title) {
    title = $('h1').first().text().trim();
  }
  if (!title) {
    title = 'Imported Page';
  }

  // Get text content with whitespace normalization
  const rawText = contentEl.text();
  const textContent = rawText
    .replace(/[\t ]+/g, ' ') // collapse horizontal whitespace
    .replace(/ ?\n ?/g, '\n') // clean spaces around newlines
    .replace(/\n{3,}/g, '\n\n') // collapse 3+ newlines to 2
    .trim();

  if (!textContent) {
    throw new Error('No text content could be extracted from the URL');
  }

  return { title, textContent };
}
