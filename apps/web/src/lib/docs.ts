import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';

export interface DocFrontmatter {
  title: string;
  description: string;
  category: string;
  order: number;
}

export interface DocSummary extends DocFrontmatter {
  slug: string;
}

export interface Doc extends DocSummary {
  body: string;
}

const DOCS_DIR = path.join(process.cwd(), 'content', 'docs');

/** Tiny YAML-ish frontmatter parser. Only supports the four fields we use. */
function parseFrontmatter(raw: string): { data: DocFrontmatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Doc file is missing frontmatter');
  }
  const [, header, body] = match;
  const data: Partial<DocFrontmatter> = {};
  for (const line of header.split(/\r?\n/)) {
    const lineMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!lineMatch) continue;
    const [, key, rawValue] = lineMatch;
    const value = rawValue.trim().replace(/^["'](.*)["']$/, '$1');
    if (key === 'order') {
      data.order = Number(value);
    } else if (key === 'title' || key === 'description' || key === 'category') {
      data[key] = value;
    }
  }
  if (!data.title || !data.description || !data.category || data.order == null) {
    throw new Error('Doc frontmatter must include title, description, category, order');
  }
  return { data: data as DocFrontmatter, body: body.trim() };
}

async function readDocFile(slug: string): Promise<Doc | null> {
  try {
    const raw = await fs.readFile(path.join(DOCS_DIR, `${slug}.md`), 'utf8');
    const { data, body } = parseFrontmatter(raw);
    return { slug, body, ...data };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function getDoc(slug: string): Promise<Doc | null> {
  return readDocFile(slug);
}

export async function listDocs(): Promise<DocSummary[]> {
  const entries = await fs.readdir(DOCS_DIR);
  const docs: DocSummary[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const slug = entry.replace(/\.md$/, '');
    const doc = await readDocFile(slug);
    if (doc) {
      const { body, ...summary } = doc;
      void body;
      docs.push(summary);
    }
  }
  return docs.sort((a, b) => a.order - b.order);
}

export interface DocCategory {
  name: string;
  docs: DocSummary[];
}

export async function listDocsByCategory(): Promise<DocCategory[]> {
  const docs = await listDocs();
  const map = new Map<string, DocSummary[]>();
  for (const doc of docs) {
    if (!map.has(doc.category)) map.set(doc.category, []);
    map.get(doc.category)!.push(doc);
  }
  const categoryOrder: string[] = [];
  for (const doc of docs) {
    if (!categoryOrder.includes(doc.category)) categoryOrder.push(doc.category);
  }
  return categoryOrder.map((name) => ({ name, docs: map.get(name)! }));
}
