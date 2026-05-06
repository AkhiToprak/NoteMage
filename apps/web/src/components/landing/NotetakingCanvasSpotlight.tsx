'use client';

import MockFrame from './MockFrame';
import SectionHeader from './SectionHeader';

const notetakingBullets = [
  { icon: 'edit_note', text: 'Slash menu — type / for headings, lists, callouts' },
  { icon: 'auto_fix', text: 'Inline AI rewrite, summarize, expand · Pro' },
  { icon: 'folder', text: 'Notebooks, folders, tags — organize your way' },
];

const canvasBullets = [
  { icon: 'draw', text: 'Infinite canvas with pen, text, and eraser tools' },
  { icon: 'palette', text: '6 pen colors, three widths, custom backgrounds' },
  { icon: 'stylus', text: 'Stylus eraser on Surface, Wacom, and S Pen devices' },
];

export default function NotetakingCanvasSpotlight() {
  return (
    <section
      id="features"
      style={{
        position: 'relative',
        padding: '128px 32px',
        background: '#15142e',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionHeader
          eyebrow="Two canvases. One notebook."
          title={
            <>
              Type it, or{' '}
              <span style={{ color: '#ae89ff' }}>draw it.</span>
            </>
          }
          description="Some ideas are words. Others are arrows and doodles. Notemage supports both, inside every notebook, without ever switching tabs."
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)',
            gap: 28,
            alignItems: 'stretch',
          }}
          className="spot-grid"
        >
          {/* Notetaking card */}
          <FeatureCard
            tag="Text notes"
            title="Write like a human"
            description="A rich text editor built for study sessions. Slash menu, markdown shortcuts, and inline AI that lives exactly where your cursor is."
            bullets={notetakingBullets}
            mockImage="/screenshots/text_file_screenshot.png"
            mockCornerLabel="Algebra · Chapter 3"
            accent="rgba(174, 137, 255, 0.35)"
          />

          {/* Canvas card */}
          <FeatureCard
            tag="Infinite canvas"
            title="Draw like a wizard"
            description="A frictionless canvas for diagrams, sketches, and handwritten notes. Excalidraw under the hood, polished by us on top."
            bullets={canvasBullets}
            mockImage="/screenshots/canvas_screenshot.png"
            mockCornerLabel="Anatomy · Sketchpad"
            accent="rgba(255, 222, 89, 0.35)"
          />
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1023px) {
          .spot-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}

function FeatureCard({
  tag,
  title,
  description,
  bullets,
  mockImage,
  mockCornerLabel,
  accent,
}: {
  tag: string;
  title: string;
  description: string;
  bullets: { icon: string; text: string }[];
  mockImage: string;
  mockCornerLabel: string;
  accent: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        padding: 32,
        borderRadius: 'var(--radius-xl)',
        background: '#181630',
        border: `1px solid ${accent}`,
        boxShadow: '0 32px 80px rgba(140, 82, 255, 0.08), 0 8px 24px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        minWidth: 0,
        overflow: 'hidden',
        transition:
          'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow =
          '0 48px 100px rgba(140, 82, 255, 0.14), 0 16px 32px rgba(0,0,0,0.45)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow =
          '0 32px 80px rgba(140, 82, 255, 0.08), 0 8px 24px rgba(0,0,0,0.4)';
      }}
    >
      <div>
        <span
          style={{
            display: 'inline-block',
            padding: '5px 11px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(174, 137, 255, 0.14)',
            fontFamily: 'var(--font-brand)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--primary)',
            fontWeight: 600,
            marginBottom: 14,
          }}
        >
          {tag}
        </span>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(26px, 3vw, 36px)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            fontWeight: 800,
            color: 'var(--on-surface)',
            margin: '0 0 14px 0',
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.65,
            color: 'rgba(237, 233, 255, 0.6)',
            margin: 0,
            fontFamily: 'var(--font-sans)',
          }}
        >
          {description}
        </p>
      </div>

      <MockFrame
        image={mockImage}
        alt={`${title} mockup`}
        cornerLabel={mockCornerLabel}
        accent={accent}
      />

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {bullets.map((b) => (
          <li
            key={b.text}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontSize: 14,
              color: 'rgba(237, 233, 255, 0.75)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 'var(--radius-md)',
                background: 'rgba(174, 137, 255, 0.12)',
                border: '1px solid rgba(174, 137, 255, 0.22)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18, color: 'var(--primary)' }}
              >
                {b.icon}
              </span>
            </span>
            {b.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
