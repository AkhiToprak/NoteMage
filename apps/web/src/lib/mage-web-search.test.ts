import { describe, it, expect } from 'vitest';
import { sanitizeWebAnnotations, isTriviallyConversational } from './mage-web-search';

describe('sanitizeWebAnnotations', () => {
  it('valid url_citation → hostname derived, www stripped, title HTML stripped', () => {
    const [link] = sanitizeWebAnnotations([
      {
        type: 'url_citation',
        url_citation: {
          url: 'https://www.nature.com/articles/123',
          title: '<b>Big</b> Discovery',
          content: 'ignored',
        },
      },
    ]);
    expect(link.url).toBe('https://www.nature.com/articles/123');
    expect(link.hostname).toBe('nature.com');
    expect(link.title).toBe('Big Discovery');
  });

  it('drops non-http(s) protocols', () => {
    const links = sanitizeWebAnnotations([
      { url_citation: { url: 'ftp://example.com/file' } },
      { url_citation: { url: 'javascript:alert(1)' } },
    ]);
    expect(links).toEqual([]);
  });

  it('drops malformed or missing urls', () => {
    const links = sanitizeWebAnnotations([
      { url_citation: { url: 'not a url' } },
      { url_citation: {} },
      { foo: 'bar' },
      null,
      undefined,
      42,
    ]);
    expect(links).toEqual([]);
  });

  it('dedupes by url', () => {
    const links = sanitizeWebAnnotations([
      { url_citation: { url: 'https://example.com/a' } },
      { url_citation: { url: 'https://example.com/a' } },
    ]);
    expect(links.length).toBe(1);
  });

  it('supports the flat .url-shaped fallback', () => {
    const [link] = sanitizeWebAnnotations([{ url: 'https://docs.example.org/page', title: 'Docs' }]);
    expect(link.hostname).toBe('docs.example.org');
    expect(link.title).toBe('Docs');
  });

  it('omits title when empty and caps to 8 links', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      url_citation: { url: `https://site${i}.com/page` },
    }));
    const links = sanitizeWebAnnotations(many);
    expect(links.length).toBe(8);
    expect(links[0].title).toBeUndefined();
  });

  it('empty input → []', () => {
    expect(sanitizeWebAnnotations([])).toEqual([]);
  });
});

describe('isTriviallyConversational', () => {
  it('greetings/acks/emoji → true', () => {
    expect(isTriviallyConversational('thanks!')).toBe(true);
    expect(isTriviallyConversational('ok')).toBe(true);
    expect(isTriviallyConversational('👍')).toBe(true);
    expect(isTriviallyConversational('thank you')).toBe(true);
    expect(isTriviallyConversational('got it')).toBe(true);
    expect(isTriviallyConversational('cool')).toBe(true);
  });

  it('real questions or substantive requests → false', () => {
    expect(isTriviallyConversational('What is the capital of France?')).toBe(false);
    expect(isTriviallyConversational('explain photosynthesis in detail')).toBe(false);
  });
});
