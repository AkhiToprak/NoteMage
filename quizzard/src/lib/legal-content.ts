import fs from 'node:fs';
import path from 'node:path';

export type LegalLang = 'en' | 'de';
export type LegalSlug = 'privacy' | 'terms' | 'legal-notice';

const CONTENT_DIR = path.join(process.cwd(), 'src', 'content', 'legal');

export function getLegalContent(slug: LegalSlug, lang: LegalLang): string {
  const filePath = path.join(CONTENT_DIR, `${slug}.${lang}.md`);
  return fs.readFileSync(filePath, 'utf-8');
}
