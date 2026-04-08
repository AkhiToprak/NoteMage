'use client';

import { useState } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

interface FeatureRow {
  name: string;
  icon: string;
  free: string;
  plus: string;
  pro: string;
}

interface FeatureCategory {
  category: string;
  features: FeatureRow[];
}

const COMPARISON_DATA: FeatureCategory[] = [
  {
    category: 'AI Features',
    features: [
      { name: 'AI Flashcard Sets', icon: 'auto_awesome', free: '1/mo', plus: '4/mo', pro: 'Unlimited' },
      { name: 'AI Presentations', icon: 'slideshow', free: '1/mo', plus: '3/mo', pro: 'Unlimited' },
      { name: 'AI Study Plans', icon: 'school', free: '2/mo', plus: '4/mo', pro: 'Unlimited' },
      { name: 'Scholar Chat Messages', icon: 'forum', free: '20/mo', plus: '100/mo', pro: 'Unlimited' },
      { name: 'And many more...', icon: 'more_horiz', free: '✓', plus: '✓', pro: '✓' },
    ],
  },
  {
    category: 'Study Tools',
    features: [
      { name: 'Notebooks', icon: 'menu_book', free: '✓', plus: '✓', pro: '✓' },
      { name: 'Text Files', icon: 'description', free: '✓', plus: '✓', pro: '✓' },
      { name: 'Canvas Files', icon: 'draw', free: '✓', plus: '✓', pro: '✓' },
      { name: 'Flashcard Creator', icon: 'style', free: '✓', plus: '✓', pro: '✓' },
      { name: 'Quiz Creator', icon: 'quiz', free: '✓', plus: '✓', pro: '✓' },
      { name: 'And many more...', icon: 'more_horiz', free: '✓', plus: '✓', pro: '✓' },
    ],
  },
  {
    category: 'Collaboration',
    features: [
      { name: 'Study Groups', icon: 'groups', free: '✓', plus: '✓', pro: '✓' },
      { name: 'Classes', icon: 'school', free: '✓', plus: '✓', pro: '✓' },
      { name: 'Direct Messages', icon: 'chat', free: '✓', plus: '✓', pro: '✓' },
      { name: 'And many more...', icon: 'more_horiz', free: '✓', plus: '✓', pro: '✓' },
    ],
  },
];

function CellValue({ value, isPro }: { value: string; isPro?: boolean }) {
  if (value === 'Unlimited') {
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
        Unlimited
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
    return (
      <span style={{ color: 'var(--outline-variant)', fontSize: 14 }}>—</span>
    );
  }
  return <span style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>{value}</span>;
}

export default function FeatureComparison() {
  const { ref, isRevealed } = useScrollReveal();
  const [expandedMobile, setExpandedMobile] = useState<number>(0);

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
        transition: 'opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)',
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
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--outline)',
                  borderBottom: '1px solid rgba(85,85,120,0.15)',
                  width: '40%',
                }}
              >
                Feature
              </th>
              {(['Free', 'Plus', 'Pro'] as const).map((tier) => (
                <th
                  key={tier}
                  style={{
                    textAlign: 'center',
                    padding: '12px 16px',
                    fontSize: 14,
                    fontWeight: 700,
                    color:
                      tier === 'Pro'
                        ? 'var(--tertiary-container)'
                        : tier === 'Plus'
                          ? 'var(--primary)'
                          : 'var(--on-surface-variant)',
                    borderBottom: '1px solid rgba(85,85,120,0.15)',
                    background:
                      tier === 'Pro' ? 'rgba(255,222,89,0.03)' : 'transparent',
                  }}
                >
                  {tier}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_DATA.map((category, catIdx) => (
              <>
                <tr key={`cat-${catIdx}`}>
                  <td
                    colSpan={4}
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
                      background:
                        rowIdx % 2 === 1
                          ? 'rgba(22,22,48,0.3)'
                          : 'transparent',
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
                      {feature.name}
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                      <CellValue value={feature.free} />
                    </td>
                    <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                      <CellValue value={feature.plus} />
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
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile Accordion ── */}
      <div className="comparison-mobile">
        {COMPARISON_DATA.map((category, catIdx) => (
          <div
            key={catIdx}
            style={{
              borderBottom: '1px solid rgba(85,85,120,0.12)',
            }}
          >
            <button
              onClick={() =>
                setExpandedMobile(expandedMobile === catIdx ? -1 : catIdx)
              }
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
                  transform:
                    expandedMobile === catIdx
                      ? 'rotate(180deg)'
                      : 'rotate(0)',
                  transition:
                    'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                expand_more
              </span>
            </button>
            <div
              style={{
                display: 'grid',
                gridTemplateRows:
                  expandedMobile === catIdx ? '1fr' : '0fr',
                transition:
                  'grid-template-rows 0.4s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                {category.features.map((feature, rowIdx) => (
                  <div
                    key={rowIdx}
                    style={{
                      padding: '12px 0',
                      borderTop: rowIdx > 0 ? '1px solid rgba(85,85,120,0.06)' : 'none',
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
                    {/* 3-column grid for tiers */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: 8,
                      }}
                    >
                      {[
                        { label: 'Free', value: feature.free },
                        { label: 'Plus', value: feature.plus },
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
                                  : item.label === 'Plus'
                                    ? 'var(--primary)'
                                    : 'var(--outline)',
                            }}
                          >
                            {item.label}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color:
                                item.value === 'Unlimited'
                                  ? 'var(--tertiary-container)'
                                  : item.value === '✓'
                                    ? 'var(--primary)'
                                    : item.value === '—'
                                      ? 'var(--outline-variant)'
                                      : 'var(--on-surface)',
                            }}
                          >
                            {item.value === 'Unlimited' ? '∞' : item.value}
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
    </section>
  );
}
