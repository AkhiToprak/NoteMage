import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDoc, listDocsByCategory, listDocs, type DocSummary } from '@/lib/docs';
import MageNav from '@/components/landing/MageNav';
import DocsMarkdown from '@/components/docs/DocsMarkdown';
import DocsSidebar from '@/components/docs/DocsSidebar';
import DocsToc from '@/components/docs/DocsToc';
import styles from '@/components/docs/Docs.module.css';

export const dynamic = 'force-static';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateStaticParams() {
  const docs = await listDocs();
  return [{ slug: [] }, ...docs.map((d) => ({ slug: [d.slug] }))];
}

/* h2 headings → "On this page" TOC. ids match DocsMarkdown's slugify exactly. */
function extractHeadings(md: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const line of md.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/[#*`_]/g, '').trim();
    const id = text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    if (id) out.push({ id, text });
  }
  return out;
}

export default async function DocsPage({ params }: PageProps) {
  const { slug } = await params;
  const slugSegment = slug?.[0];

  if (slug && slug.length > 1) notFound();

  const categories = await listDocsByCategory();

  if (!slugSegment) {
    return (
      <DocsShell categories={categories} currentSlug={null}>
        <DocsIndex categories={categories} />
      </DocsShell>
    );
  }

  const doc = await getDoc(slugSegment);
  if (!doc) notFound();

  const allDocs = categories.flatMap((c) => c.docs);
  const idx = allDocs.findIndex((d) => d.slug === doc.slug);
  const prev = idx > 0 ? allDocs[idx - 1] : null;
  const next = idx >= 0 && idx < allDocs.length - 1 ? allDocs[idx + 1] : null;
  const headings = extractHeadings(doc.body);

  return (
    <DocsShell categories={categories} currentSlug={doc.slug} headings={headings}>
      <article className={styles.article}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href="/docs" className={styles.crumbLink}>Docs</Link>
          <span className={`material-symbols-outlined ${styles.crumbSep}`} aria-hidden>chevron_right</span>
          <span className={styles.crumbCurrent}>{doc.title}</span>
        </nav>

        <h1
          style={{
            fontSize: 'clamp(30px, 4vw, 42px)',
            fontWeight: 800,
            letterSpacing: '-0.025em',
            lineHeight: 1.08,
            color: '#18202f',
            margin: '0 0 10px 0',
          }}
        >
          {doc.title}
        </h1>
        {doc.description && <p className={styles.lead}>{doc.description}</p>}

        <DocsMarkdown content={doc.body} />

        {(prev || next) && (
          <div className={styles.prevNext}>
            {prev ? (
              <Link href={`/docs/${prev.slug}`} className={styles.pnCard}>
                <span className={styles.pnEyebrow}>← Previous</span>
                <span className={styles.pnTitle}>{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/docs/${next.slug}`} className={`${styles.pnCard} ${styles.pnNext}`}>
                <span className={styles.pnEyebrow}>Next</span>
                <span className={styles.pnTitle}>{next.title} →</span>
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </article>
    </DocsShell>
  );
}

/* ────────────────────────── Shell ────────────────────────── */
function DocsShell({
  categories,
  currentSlug,
  headings,
  children,
}: {
  categories: { name: string; docs: DocSummary[] }[];
  currentSlug: string | null;
  headings?: { id: string; text: string }[];
  children: React.ReactNode;
}) {
  const toc = headings && headings.length > 0 ? <DocsToc headings={headings} /> : null;
  return (
    <>
      <MageNav />
      <div className={styles.page}>
        <div className={`${styles.shell} ${toc ? '' : styles.shellNoToc}`}>
          <DocsSidebar categories={categories} currentSlug={currentSlug} />
          <main className={styles.content}>{children}</main>
          {toc}
        </div>
      </div>
    </>
  );
}

/* ────────────────────────── Index (/docs) ────────────────────────── */
function DocsIndex({ categories }: { categories: { name: string; docs: DocSummary[] }[] }) {
  return (
    <div className={styles.indexWrap}>
      <span className={styles.idxPill}>
        <span className="material-symbols-outlined" aria-hidden>auto_stories</span>
        Notemage docs
      </span>
      <h1 className={styles.idxTitle}>
        Everything Notemage <span className={styles.idxTitleAccent}>can do for you.</span>
      </h1>
      <p className={styles.idxLead}>
        Study packs, Mage Chat, flashcards, quizzes, learning paths, AI-generated presentations,
        gamification — every feature, with the steps to get there. Pick a topic on the left, or start
        with the basics below.
      </p>

      {categories.map((cat) => (
        <section key={cat.name} className={styles.idxSection}>
          <h2 className={styles.idxSectionLabel}>{cat.name}</h2>
          <div className={styles.idxGrid}>
            {cat.docs.map((doc) => (
              <Link key={doc.slug} href={`/docs/${doc.slug}`} className={styles.idxCard}>
                <h3 className={styles.idxCardTitle}>{doc.title}</h3>
                <p className={styles.idxCardDesc}>{doc.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
