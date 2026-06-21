import Link from 'next/link';
import {
  FIGMA_FILE_KEY,
  FIGMA_PAGE,
  FLOWS,
  SCREENS,
  TOTAL_FRAMES,
  frameCount,
  getFlowScreens,
  isBuilt,
} from '@/figma/registry';
import card from '@/figma/kit/kit.module.css';

export default function FigmaGalleryPage() {
  const builtCount = SCREENS.filter(isBuilt).length;

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 'var(--space-12) var(--space-6) 96px' }}>
      {/* Header */}
      <header style={{ marginBottom: 'var(--space-12)' }}>
        <p
          style={{
            fontFamily: 'var(--font-brand)',
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            fontSize: 'var(--fs-sm)',
            color: 'var(--nm-primary)',
            margin: 0,
          }}
        >
          Design-fidelity build
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-3xl)',
            lineHeight: 'var(--lh-tight)',
            letterSpacing: '-0.02em',
            margin: '4px 0 8px',
          }}
        >
          NoteMage · Figma screens
        </h1>
        <p style={{ color: 'var(--ink-60)', fontSize: 'var(--fs-md)', maxWidth: 720, margin: 0 }}>
          A throwaway, interactive 1:1 reproduction of the Figma file{' '}
          <code style={{ color: 'var(--on-surface-variant)' }}>{FIGMA_FILE_KEY}</code> · page{' '}
          <em>{FIGMA_PAGE}</em>. Every screen switches mobile/web at the 1024px breakpoint; open one
          to compare against Figma in a phone or desktop frame.
        </p>

        {/* Stat chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
          <Stat label="screens" value={String(SCREENS.length)} />
          <Stat label="frames" value={String(TOTAL_FRAMES)} />
          <Stat label="built" value={`${builtCount} / ${SCREENS.length}`} />
          <Stat label="flows" value={String(FLOWS.length)} />
        </div>
      </header>

      {/* Flow sections */}
      {FLOWS.map((flow) => {
        const screens = getFlowScreens(flow.id);
        const builtInFlow = screens.filter(isBuilt).length;
        return (
          <section key={flow.id} style={{ marginBottom: 'var(--space-16)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', margin: 0 }}>
                {flow.label}
              </h2>
              <span style={{ color: 'var(--ink-40)', fontSize: 'var(--fs-sm)' }}>
                {builtInFlow}/{screens.length} built
              </span>
            </div>
            <p style={{ color: 'var(--ink-50)', fontSize: 'var(--fs-sm)', margin: '0 0 var(--space-4)' }}>
              {flow.blurb}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              {screens.map((s) => {
                const built = isBuilt(s);
                return (
                  <Link
                    key={s.slug}
                    href={`/figma/${s.slug}`}
                    className={`${card.card} ${card.cardInteractive}`}
                    style={{
                      display: 'grid',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-4)',
                      textDecoration: 'none',
                      color: 'var(--on-surface)',
                    }}
                  >
                    {/* Mini device silhouettes */}
                    <div
                      style={{
                        height: 96,
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--surface-container-low)',
                        display: 'grid',
                        placeItems: 'center',
                        gap: 6,
                        gridAutoFlow: 'column',
                        color: 'var(--ink-30)',
                      }}
                    >
                      {s.nodeMobile && (
                        <span className="material-symbols-outlined" style={{ fontSize: 34 }}>
                          smartphone
                        </span>
                      )}
                      {s.nodeWeb && (
                        <span className="material-symbols-outlined" style={{ fontSize: 40 }}>
                          desktop_windows
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 'var(--radius-full)',
                          background: built ? 'var(--nm-complete)' : 'var(--ink-20)',
                          flex: '0 0 auto',
                        }}
                      />
                      <strong style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-base)' }}>
                        {s.title}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-40)', fontSize: 'var(--fs-2xs)' }}>
                      <span>
                        {[s.nodeMobile && `m ${s.nodeMobile}`, s.nodeWeb && `w ${s.nodeWeb}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span>{frameCount(s)} fr</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 6,
        padding: '6px 12px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--surface-container)',
        border: '1px solid var(--ink-08)',
        fontSize: 'var(--fs-sm)',
      }}
    >
      <strong style={{ fontFamily: 'var(--font-display)' }}>{value}</strong>
      <span style={{ color: 'var(--ink-50)' }}>{label}</span>
    </span>
  );
}
