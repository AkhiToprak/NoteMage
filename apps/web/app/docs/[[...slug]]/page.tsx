import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDoc, listDocsByCategory, listDocs, type DocSummary } from '@/lib/docs';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';
import DocsMarkdown from '@/components/docs/DocsMarkdown';

export const dynamic = 'force-static';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export async function generateStaticParams() {
  const docs = await listDocs();
  return [{ slug: [] }, ...docs.map((d) => ({ slug: [d.slug] }))];
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

  return (
    <DocsShell categories={categories} currentSlug={doc.slug}>
      <article style={{ maxWidth: 760 }}>
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-brand)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(238, 236, 255, 0.42)',
            marginBottom: 18,
          }}
        >
          <Link href="/docs" style={crumbLink}>
            Docs
          </Link>
          <span className="material-symbols-outlined" style={crumbSep}>
            chevron_right
          </span>
          <span style={{ color: 'rgba(238, 236, 255, 0.55)' }}>{doc.category}</span>
          <span className="material-symbols-outlined" style={crumbSep}>
            chevron_right
          </span>
          <span style={{ color: 'var(--primary)' }}>{doc.title}</span>
        </nav>

        <p
          style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: 'rgba(238, 236, 255, 0.62)',
            margin: '0 0 36px 0',
            fontFamily: 'var(--font-sans)',
            maxWidth: 640,
          }}
        >
          {doc.description}
        </p>

        <DocsMarkdown content={`# ${doc.title}\n\n${doc.body}`} />

        {/* Prev / Next nav */}
        {(prev || next) && (
          <div
            style={{
              marginTop: 64,
              paddingTop: 32,
              borderTop: '1px solid rgba(174,137,255,0.16)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
            }}
          >
            {prev ? (
              <Link href={`/docs/${prev.slug}`} style={prevNextCard('prev')}>
                <span style={prevNextEyebrow}>← Previous</span>
                <span style={prevNextTitle}>{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/docs/${next.slug}`} style={prevNextCard('next')}>
                <span style={prevNextEyebrow}>Next →</span>
                <span style={prevNextTitle}>{next.title}</span>
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

/* ──────────────────────────────────────────────────────────────────────
   Shell — navbar, sidebar, content area, footer
   ────────────────────────────────────────────────────────────────────── */

function DocsShell({
  categories,
  currentSlug,
  children,
}: {
  categories: { name: string; docs: DocSummary[] }[];
  currentSlug: string | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingNavbar />
      <main
        style={{
          paddingTop: 112,
          paddingBottom: 96,
          minHeight: 'calc(100vh - 200px)',
        }}
      >
        <div
          className="docs-shell"
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 32px',
            display: 'grid',
            gridTemplateColumns: '260px 1fr',
            gap: 64,
            alignItems: 'start',
          }}
        >
          <DocsSidebar categories={categories} currentSlug={currentSlug} />
          <div className="docs-main" style={{ minWidth: 0 }}>
            {children}
          </div>
        </div>

        {/* Responsive collapse: hide sidebar on tablet and below; surface a category jump above content */}
        <style>{`
          @media (max-width: 1023px) {
            .docs-shell {
              grid-template-columns: 1fr !important;
              gap: 32px !important;
            }
            .docs-sidebar { display: none !important; }
            .docs-mobile-toc { display: block !important; }
          }
        `}</style>
      </main>
      <LandingFooter />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Sidebar — server-rendered, no client JS needed
   ────────────────────────────────────────────────────────────────────── */

function DocsSidebar({
  categories,
  currentSlug,
}: {
  categories: { name: string; docs: DocSummary[] }[];
  currentSlug: string | null;
}) {
  return (
    <aside
      className="docs-sidebar"
      style={{
        position: 'sticky',
        top: 112,
        maxHeight: 'calc(100vh - 140px)',
        overflowY: 'auto',
        paddingRight: 8,
        paddingBottom: 24,
      }}
    >
      <Link
        href="/docs"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(174,137,255,0.10)',
          border: '1px solid rgba(174,137,255,0.24)',
          fontFamily: 'var(--font-brand)',
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--primary)',
          fontWeight: 600,
          textDecoration: 'none',
          marginBottom: 28,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          menu_book
        </span>
        Documentation
      </Link>

      <nav>
        {categories.map((cat, ci) => (
          <div key={cat.name} style={{ marginBottom: ci === categories.length - 1 ? 0 : 28 }}>
            <h4
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(238, 236, 255, 0.42)',
                margin: '0 0 10px 12px',
              }}
            >
              {cat.name}
            </h4>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {cat.docs.map((doc) => {
                const active = doc.slug === currentSlug;
                return (
                  <li key={doc.slug}>
                    <Link
                      href={`/docs/${doc.slug}`}
                      className="docs-side-link"
                      data-active={active ? 'true' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 14,
                        fontFamily: 'var(--font-sans)',
                        fontWeight: active ? 600 : 500,
                        color: active ? 'var(--on-surface)' : 'rgba(238, 236, 255, 0.62)',
                        textDecoration: 'none',
                        background: active
                          ? 'linear-gradient(90deg, rgba(174,137,255,0.18) 0%, rgba(174,137,255,0.04) 100%)'
                          : 'transparent',
                        borderLeft: active ? '2px solid var(--primary)' : '2px solid transparent',
                        position: 'relative',
                      }}
                    >
                      {doc.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <style>{`
        .docs-side-link {
          transition: background 0.25s cubic-bezier(0.22,1,0.36,1), color 0.25s cubic-bezier(0.22,1,0.36,1);
        }
        .docs-side-link:hover:not([data-active]) {
          background: rgba(174,137,255,0.06) !important;
          color: var(--on-surface) !important;
        }
        .docs-sidebar::-webkit-scrollbar { width: 6px; }
        .docs-sidebar::-webkit-scrollbar-thumb { background: rgba(174,137,255,0.22); border-radius: 3px; }
      `}</style>
    </aside>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Index page — shown at /docs
   ────────────────────────────────────────────────────────────────────── */

function DocsIndex({ categories }: { categories: { name: string; docs: DocSummary[] }[] }) {
  return (
    <div style={{ maxWidth: 880 }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(255,222,89,0.10)',
          border: '1px solid rgba(255,222,89,0.28)',
          fontFamily: 'var(--font-brand)',
          fontSize: 11,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: '#ffde59',
          fontWeight: 600,
          marginBottom: 24,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          auto_stories
        </span>
        Notemage docs
      </span>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(40px, 5.2vw, 60px)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1.02,
          color: 'var(--on-surface)',
          margin: '0 0 20px 0',
        }}
      >
        Everything Notemage{' '}
        <span
          style={{
            background: 'linear-gradient(135deg, #ae89ff 0%, #ffde59 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          can do for you.
        </span>
      </h1>
      <p
        style={{
          fontSize: 18,
          lineHeight: 1.65,
          color: 'rgba(238, 236, 255, 0.62)',
          margin: '0 0 56px 0',
          maxWidth: 640,
          fontFamily: 'var(--font-sans)',
        }}
      >
        Notebooks, the infinite canvas, Mage Chat, flashcards, quizzes, AI-generated presentations,
        real-time cowork, gamification — every feature, with the steps to get there. Pick a topic on
        the left, or start with the basics below.
      </p>

      {categories.map((cat) => (
        <section key={cat.name} style={{ marginBottom: 56 }}>
          <h2
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--primary)',
              margin: '0 0 18px 0',
            }}
          >
            {cat.name}
          </h2>
          <div
            className="docs-card-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 16,
            }}
          >
            {cat.docs.map((doc) => (
              <Link
                key={doc.slug}
                href={`/docs/${doc.slug}`}
                className="docs-index-card"
                style={{
                  display: 'block',
                  padding: '22px 24px',
                  borderRadius: 'var(--radius-lg)',
                  background:
                    'linear-gradient(180deg, rgba(28, 24, 56, 0.55) 0%, rgba(16, 14, 34, 0.65) 100%)',
                  border: '1px solid rgba(174,137,255,0.18)',
                  textDecoration: 'none',
                  position: 'relative',
                  overflow: 'hidden',
                  transition:
                    'transform 0.35s cubic-bezier(0.22,1,0.36,1), border-color 0.35s cubic-bezier(0.22,1,0.36,1), background 0.35s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    color: 'var(--on-surface)',
                    margin: '0 0 6px 0',
                  }}
                >
                  {doc.title}
                </h3>
                <p
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: 'rgba(238, 236, 255, 0.55)',
                    margin: 0,
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {doc.description}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <style>{`
        .docs-index-card:hover {
          transform: translateY(-3px);
          border-color: rgba(174,137,255,0.42) !important;
          background: linear-gradient(180deg, rgba(36, 30, 72, 0.65) 0%, rgba(20, 17, 44, 0.7) 100%) !important;
        }
        @media (max-width: 639px) {
          .docs-card-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   Inline style helpers (kept here so the file stays one place)
   ────────────────────────────────────────────────────────────────────── */

const crumbLink: React.CSSProperties = {
  color: 'rgba(238, 236, 255, 0.55)',
  textDecoration: 'none',
};
const crumbSep: React.CSSProperties = {
  fontSize: 14,
  color: 'rgba(174,137,255,0.5)',
};

function prevNextCard(_kind: 'prev' | 'next'): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '18px 20px',
    borderRadius: 'var(--radius-lg)',
    background: 'rgba(28, 24, 56, 0.4)',
    border: '1px solid rgba(174,137,255,0.18)',
    textDecoration: 'none',
    transition:
      'transform 0.3s cubic-bezier(0.22,1,0.36,1), border-color 0.3s cubic-bezier(0.22,1,0.36,1)',
  };
}

const prevNextEyebrow: React.CSSProperties = {
  fontFamily: 'var(--font-brand)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--primary)',
  fontWeight: 600,
};

const prevNextTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--on-surface)',
};
