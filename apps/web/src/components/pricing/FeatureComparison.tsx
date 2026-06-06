'use client';

import { Fragment, useState, type ReactElement } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { CanvasIcon, NotebookIcon, TextFileIcon } from '@/components/icons/NavIcons';
import { TIERS, isLifetimeLimit, type TierKey, type FeatureType } from '@/lib/tiers';

interface FeatureRow {
  name: string;
  /** Either a Material Symbols icon name, or a custom SVG element from NavIcons. */
  icon: string | ReactElement;
  free: string;
  pro: string;
}

interface FeatureCategory {
  category: string;
  features: FeatureRow[];
}

/**
 * Format a TIERS limit the way the comparison cells expect:
 * -1 → "Unlimited*", 0 → "—", otherwise "<n>/mo" (or "<n> total" for a
 * lifetime budget). Driving this table off TIERS keeps it in lockstep with
 * the pricing cards and the server-side enforcement — the numbers can't drift.
 */
function limitLabel(tier: TierKey, feature: FeatureType): string {
  const limit = TIERS[tier].limits[feature];
  if (limit === -1) return 'Unlimited*';
  if (limit === 0) return '—';
  return `${limit}${isLifetimeLimit(tier, feature) ? ' total' : '/mo'}`;
}

const COMPARISON_DATA: FeatureCategory[] = [
  {
    category: 'AI Features',
    features: [
      {
        name: 'AI Flashcard Sets',
        icon: 'auto_awesome',
        free: limitLabel('FREE', 'ai_flashcards'),
        pro: limitLabel('PRO', 'ai_flashcards'),
      },
      {
        name: 'AI Presentations',
        icon: 'slideshow',
        free: limitLabel('FREE', 'ai_pptx'),
        pro: limitLabel('PRO', 'ai_pptx'),
      },
      {
        name: 'AI Study Plans',
        icon: 'school',
        free: limitLabel('FREE', 'ai_study_plan'),
        pro: limitLabel('PRO', 'ai_study_plan'),
      },
      {
        name: 'Ultra Paths',
        icon: 'bolt',
        free: limitLabel('FREE', 'ultra_path'),
        pro: limitLabel('PRO', 'ultra_path'),
      },
      {
        name: 'AI Quizzes',
        icon: 'quiz',
        free: limitLabel('FREE', 'ai_quizzes'),
        pro: limitLabel('PRO', 'ai_quizzes'),
      },
      {
        name: 'Mage Chat Messages',
        icon: 'forum',
        free: limitLabel('FREE', 'scholar_chat'),
        pro: limitLabel('PRO', 'scholar_chat'),
      },
      {
        name: 'Inline AI Editing',
        icon: 'auto_fix',
        free: limitLabel('FREE', 'ai_inline_edit'),
        pro: limitLabel('PRO', 'ai_inline_edit'),
      },
      {
        name: 'PDF Pages',
        icon: 'picture_as_pdf',
        free: limitLabel('FREE', 'pdf_import'),
        pro: limitLabel('PRO', 'pdf_import'),
      },
      {
        name: 'Path Translations',
        icon: 'translate',
        free: limitLabel('FREE', 'path_translation'),
        pro: limitLabel('PRO', 'path_translation'),
      },
      { name: 'And many more…', icon: 'more_horiz', free: '✓', pro: '✓' },
    ],
  },
  {
    category: 'Study Tools',
    features: [
      { name: 'Notebooks', icon: <NotebookIcon size={18} />, free: '✓', pro: '✓' },
      { name: 'Text Files', icon: <TextFileIcon size={18} />, free: '✓', pro: '✓' },
      { name: 'Canvas Files', icon: <CanvasIcon size={18} />, free: '✓', pro: '✓' },
      { name: 'Flashcard Creator', icon: 'style', free: '✓', pro: '✓' },
      { name: 'Quiz Creator', icon: 'quiz', free: '✓', pro: '✓' },
      { name: 'And many more…', icon: 'more_horiz', free: '✓', pro: '✓' },
    ],
  },
  {
    category: 'Collaboration',
    features: [
      { name: 'Study Groups', icon: 'groups', free: '✓', pro: '✓' },
      { name: 'Classes', icon: 'school', free: '✓', pro: '✓' },
      { name: 'Direct Messages', icon: 'chat', free: '✓', pro: '✓' },
      { name: 'And many more…', icon: 'more_horiz', free: '✓', pro: '✓' },
    ],
  },
];

function buildComparisonData(freeAiPathsDisabled: boolean): FeatureCategory[] {
  // Phase 12 switchover: when FREE AI path generation is off, FREE users get
  // curated community paths instead of AI-generated ones. Reframe the row so the
  // table tells the truth and stays consistent with the pricing card.
  const studyPathsRow: FeatureRow = freeAiPathsDisabled
    ? {
        name: 'Study Paths',
        icon: 'school',
        free: 'Community',
        pro: limitLabel('PRO', 'ai_study_plan'),
      }
    : {
        name: 'AI Study Plans',
        icon: 'school',
        free: limitLabel('FREE', 'ai_study_plan'),
        pro: limitLabel('PRO', 'ai_study_plan'),
      };

  return COMPARISON_DATA.map((category) =>
    category.category === 'AI Features'
      ? {
          ...category,
          features: category.features.map((f) =>
            f.name === 'AI Study Plans' ? studyPathsRow : f
          ),
        }
      : category
  );
}

function CellValue({ value, isPro }: { value: string; isPro?: boolean }) {
  if (value === 'Unlimited*' || value === 'Unlimited') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--tertiary-container)',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
        >
          all_inclusive
        </span>
        Unlimited{value.includes('*') ? '*' : ''}
      </span>
    );
  }
  if (value === '✓') {
    return (
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 18,
          color: isPro ? 'var(--tertiary-container)' : 'var(--primary)',
          fontVariationSettings: "'FILL' 1",
        }}
      >
        check_circle
      </span>
    );
  }
  if (value === '—') {
    return <span style={{ color: 'var(--outline-variant)', fontSize: 14 }}>—</span>;
  }
  return <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{value}</span>;
}

export default function FeatureComparison({
  freeAiPathsDisabled = false,
}: {
  freeAiPathsDisabled?: boolean;
}) {
  const { ref, isRevealed } = useScrollReveal();
  const [expandedMobile, setExpandedMobile] = useState<number>(0);
  const comparisonData = buildComparisonData(freeAiPathsDisabled);

  return (
    <section
      ref={ref}
      className="comparison-section"
      style={{
        padding: '80px 40px',
        maxWidth: 960,
        margin: '0 auto',
        opacity: isRevealed ? 1 : 0,
        transform: isRevealed ? 'translateY(0)' : 'translateY(24px)',
        transition:
          'opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 700,
          textAlign: 'center',
          color: 'var(--on-surface)',
          marginBottom: 48,
          letterSpacing: '-0.02em',
        }}
      >
        Compare plans in detail
      </h2>

      {/* ── Desktop Table ── */}
      <div className="comparison-desktop">
        <table
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--outline)',
                  borderBottom: '1px solid rgba(85,85,120,0.30)',
                  width: '40%',
                }}
              >
                Feature
              </th>
              {(['Free', 'Pro'] as const).map((tier) => (
                <th
                  key={tier}
                  scope="col"
                  style={{
                    textAlign: 'center',
                    padding: '12px 16px',
                    fontSize: 14,
                    fontWeight: 700,
                    color:
                      tier === 'Pro'
                        ? 'var(--tertiary-container)'
                        : 'var(--on-surface-variant)',
                    borderBottom: '1px solid rgba(85,85,120,0.30)',
                    background: tier === 'Pro' ? 'rgba(255,222,89,0.03)' : 'transparent',
                  }}
                >
                  {tier}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparisonData.map((category, catIdx) => (
              <Fragment key={catIdx}>
                <tr>
                  <td
                    colSpan={3}
                    style={{
                      padding: '20px 16px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--primary)',
                    }}
                  >
                    {category.category}
                  </td>
                </tr>
                {category.features.map((feature, rowIdx) => (
                  <tr
                    key={`${catIdx}-${rowIdx}`}
                    className="comparison-row"
                    style={{
                      background: rowIdx % 2 === 1 ? 'rgba(33, 33, 62,0.3)' : 'transparent',
                      transition: 'background 0.2s',
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        color: 'var(--on-surface-variant)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      {typeof feature.icon === 'string' ? (
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: 18,
                            color: 'var(--outline)',
                            flexShrink: 0,
                          }}
                        >
                          {feature.icon}
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            color: 'var(--outline)',
                            flexShrink: 0,
                          }}
                        >
                          {feature.icon}
                        </span>
                      )}
                      {feature.name}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                      <CellValue value={feature.free} />
                    </td>
                    <td
                      style={{
                        textAlign: 'center',
                        padding: '12px 16px',
                        background: 'rgba(255,222,89,0.03)',
                      }}
                    >
                      <CellValue value={feature.pro} isPro />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile Accordion ── */}
      <div className="comparison-mobile">
        {comparisonData.map((category, catIdx) => (
          <div
            key={catIdx}
            style={{
              borderBottom: '1px solid rgba(85,85,120,0.24)',
            }}
          >
            <button
              onClick={() => setExpandedMobile(expandedMobile === catIdx ? -1 : catIdx)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 0',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--on-surface)',
                fontSize: 16,
                fontWeight: 700,
                fontFamily: 'var(--font-display)',
              }}
            >
              {category.category}
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 22,
                  color: 'var(--outline)',
                  transform: expandedMobile === catIdx ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                expand_more
              </span>
            </button>
            <div
              style={{
                display: 'grid',
                gridTemplateRows: expandedMobile === catIdx ? '1fr' : '0fr',
                transition: 'grid-template-rows 0.4s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                {category.features.map((feature, rowIdx) => (
                  <div
                    key={rowIdx}
                    style={{
                      padding: '12px 0',
                      borderTop: rowIdx > 0 ? '1px solid rgba(85,85,120,0.12)' : 'none',
                      opacity: expandedMobile === catIdx ? 1 : 0,
                      transition: 'opacity 0.3s cubic-bezier(0.22,1,0.36,1)',
                      transitionDelay: expandedMobile === catIdx ? `${rowIdx * 40}ms` : '0ms',
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--on-surface)',
                        marginBottom: 10,
                      }}
                    >
                      {feature.name}
                    </span>
                    {/* Per-tier values */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 8,
                      }}
                    >
                      {[
                        { label: 'Free', value: feature.free },
                        { label: 'Pro', value: feature.pro },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 3,
                            padding: '8px 6px',
                            borderRadius: 'var(--radius-sm)',
                            background:
                              item.label === 'Pro'
                                ? 'rgba(255,222,89,0.06)'
                                : 'var(--surface-container-high)',
                            border:
                              item.label === 'Pro'
                                ? '1px solid rgba(255,222,89,0.12)'
                                : '1px solid rgba(85,85,120,0.08)',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              color:
                                item.label === 'Pro'
                                  ? 'var(--tertiary-container)'
                                  : 'var(--outline)',
                            }}
                          >
                            {item.label}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: item.value.startsWith('Unlimited')
                                ? 'var(--tertiary-container)'
                                : item.value === '✓'
                                  ? 'var(--primary)'
                                  : item.value === '—'
                                    ? 'var(--outline-variant)'
                                    : 'var(--on-surface)',
                            }}
                          >
                            {item.value.startsWith('Unlimited') ? '∞*' : item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Footnote */}
      <p
        style={{
          marginTop: 32,
          fontSize: 12,
          color: 'var(--outline)',
          lineHeight: 1.6,
          textAlign: 'center',
          fontStyle: 'italic',
        }}
      >
        *Pro plan usage is subject to a fair use policy (~1M tokens/month). This limit exists
        because every AI feature costs us real money per request. 1M tokens is far more than any
        student would realistically use in a month — it&apos;s just there to prevent abuse.
      </p>
    </section>
  );
}
