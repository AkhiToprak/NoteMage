'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import useEmblaCarousel from 'embla-carousel-react';
import SectionHeader from './SectionHeader';

interface Tool {
  icon: string;
  tag: string;
  title: string;
  description: string;
  accent: string;
  docsHref: string;
}

const tools: Tool[] = [
  {
    icon: 'style',
    tag: 'Spaced repetition',
    title: 'Flashcards',
    description:
      'Generate a deck from any page in seconds. Hints, explanations, and image support built in.',
    accent: '#ae89ff',
    docsHref: '/docs/flashcards',
  },
  {
    icon: 'quiz',
    tag: 'Test yourself',
    title: 'Quizzes',
    description:
      'Multiple choice with hints, explanations, and attempt history. Perfect for exam week.',
    accent: '#ffde59',
    docsHref: '/docs/quizzes',
  },
  {
    icon: 'slideshow',
    tag: 'One-click export',
    title: 'Slides (.pptx)',
    description: 'Turn any set of pages into polished PowerPoint slides — ready to present.',
    accent: '#b9c3ff',
    docsHref: '/docs/presentations',
  },
  {
    icon: 'account_tree',
    tag: 'Visual learning',
    title: 'Mind maps',
    description: 'Hierarchies and connections auto-rendered from your notes via markmap.',
    accent: '#8ce5a7',
    docsHref: '/docs/mind-maps',
  },
  {
    icon: 'event',
    tag: 'Stay accountable',
    title: 'Exam countdown',
    description: 'Add exams, get daily goals, and watch a countdown that keeps you moving.',
    accent: '#fd6f85',
    docsHref: '/docs/exams-and-timers#exams',
  },
  {
    icon: 'local_fire_department',
    tag: 'Stay consistent',
    title: 'Streaks + Achievements',
    description:
      'Build a daily streak, rack up achievements, and unlock cosmetics for your profile.',
    accent: '#c9a6ff',
    docsHref: '/docs/xp-streaks-achievements',
  },
  {
    icon: 'timer',
    tag: 'Focus sprints',
    title: 'Pomodoro',
    description:
      '25-minute sprints with built-in breaks. Stay locked in without leaving your notebook.',
    accent: '#ff9566',
    docsHref: '/docs/exams-and-timers#pomodoro',
  },
];

export default function LearningToolsCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [snapCount, setSnapCount] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    const onInit = () => setSnapCount(emblaApi.scrollSnapList().length);
    onSelect();
    onInit();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onInit);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onInit);
    };
  }, [emblaApi]);

  return (
    <section
      style={{
        position: 'relative',
        padding: '128px 0',
        background: 'transparent',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '0 32px' }}>
        <SectionHeader
          eyebrow="Study toolkit"
          title={
            <>
              All your study tools, <span style={{ color: '#ffde59' }}>one tap away.</span>
            </>
          }
          description="Turn any page into a quiz, a flashcard deck, a mind map, or a polished slide export — without opening a single other app."
        />
      </div>

      {/* Carousel */}
      <div
        ref={emblaRef}
        style={{ overflow: 'hidden', padding: '8px 32px' }}
        aria-roledescription="carousel"
        aria-label="Learning tools"
      >
        <div style={{ display: 'flex', gap: 24, alignItems: 'stretch' }}>
          {tools.map((t, i) => (
            <div
              key={t.title}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${tools.length}: ${t.title}`}
              style={{
                flex: '0 0 340px',
                maxWidth: 340,
                minWidth: 0,
                display: 'flex',
              }}
              className="tool-slide"
            >
              <ToolCard tool={t} />
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          maxWidth: 1280,
          margin: '48px auto 0',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: snapCount }).map((_, i) => {
            const active = i === selectedIndex;
            return (
              <button
                key={i}
                type="button"
                aria-label={`Go to tool ${i + 1}`}
                onClick={() => scrollTo(i)}
                style={{
                  width: active ? 28 : 8,
                  height: 8,
                  borderRadius: 'var(--radius-full)',
                  background: active ? 'var(--primary)' : 'rgba(237, 233, 255, 0.18)',
                  border: 'none',
                  cursor: 'pointer',
                  transition:
                    'width 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                  boxShadow: active ? '0 0 10px var(--primary)' : 'none',
                }}
              />
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Previous tool', icon: 'arrow_back', onClick: scrollPrev },
            { label: 'Next tool', icon: 'arrow_forward', onClick: scrollNext },
          ].map((b) => (
            <button
              key={b.icon}
              type="button"
              aria-label={b.label}
              onClick={b.onClick}
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(174, 137, 255, 0.1)',
                border: '1px solid rgba(174, 137, 255, 0.28)',
                color: 'var(--on-surface)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition:
                  'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.background = 'rgba(174, 137, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.background = 'rgba(174, 137, 255, 0.1)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                {b.icon}
              </span>
            </button>
          ))}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 639px) {
          .tool-slide {
            flex: 0 0 88% !important;
            max-width: 88% !important;
          }
        }
      `}</style>
    </section>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        borderRadius: 'var(--radius-xl)',
        background: '#16142c',
        border: `1px solid ${tool.accent}44`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        padding: 28,
        minHeight: 280,
        transition:
          'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        boxShadow: '0 24px 60px rgba(140, 82, 255, 0.08), 0 8px 24px rgba(0,0,0,0.35)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-6px)';
        e.currentTarget.style.boxShadow = `0 40px 90px ${tool.accent}22, 0 16px 32px rgba(0,0,0,0.4)`;
        e.currentTarget.style.borderColor = `${tool.accent}88`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow =
          '0 24px 60px rgba(140, 82, 255, 0.08), 0 8px 24px rgba(0,0,0,0.35)';
        e.currentTarget.style.borderColor = `${tool.accent}44`;
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--radius-md)',
          background: `${tool.accent}14`,
          border: `1px solid ${tool.accent}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 22,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 26, color: tool.accent }}>
          {tool.icon}
        </span>
      </div>

      <span
        style={{
          display: 'inline-block',
          alignSelf: 'flex-start',
          padding: '4px 10px',
          borderRadius: 'var(--radius-full)',
          background: `${tool.accent}14`,
          border: `1px solid ${tool.accent}33`,
          fontFamily: 'var(--font-brand)',
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: tool.accent,
          fontWeight: 600,
          marginBottom: 14,
        }}
      >
        {tool.tag}
      </span>
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          fontWeight: 800,
          color: 'var(--on-surface)',
          margin: '0 0 10px 0',
        }}
      >
        {tool.title}
      </h3>
      <p
        style={{
          flex: 1,
          fontSize: 14,
          lineHeight: 1.55,
          color: 'rgba(237, 233, 255, 0.58)',
          margin: '0 0 20px 0',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {tool.description}
      </p>

      <Link
        href={tool.docsHref}
        aria-label={`Explore ${tool.title} documentation`}
        className="tool-explore"
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          fontFamily: 'var(--font-brand)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: tool.accent,
          fontWeight: 600,
          textDecoration: 'none',
          cursor: 'pointer',
          padding: '6px 10px',
          margin: '-6px -10px',
          borderRadius: 'var(--radius-sm)',
          transition:
            'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          outlineOffset: 3,
          ['--tool-accent' as string]: tool.accent,
        }}
        onMouseEnter={(e) => {
          const arrow = e.currentTarget.querySelector('span');
          if (arrow) (arrow as HTMLElement).style.transform = 'translateX(3px)';
          e.currentTarget.style.background = `${tool.accent}14`;
        }}
        onMouseLeave={(e) => {
          const arrow = e.currentTarget.querySelector('span');
          if (arrow) (arrow as HTMLElement).style.transform = 'translateX(0)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        Explore
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 16,
            transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          arrow_forward
        </span>
      </Link>
    </div>
  );
}
