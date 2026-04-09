'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import SectionHeader from './SectionHeader';

interface Tool {
  icon: string;
  tag: string;
  title: string;
  description: string;
  accent: string;
  placeholder: string;
}

const tools: Tool[] = [
  {
    icon: 'style',
    tag: 'Spaced repetition',
    title: 'Flashcards',
    description:
      'Generate a deck from any page in seconds. Hints, explanations, and image support built in.',
    accent: '#ae89ff',
    placeholder:
      'https://placehold.co/620x400/161630/ae89ff/png?text=Flashcards',
  },
  {
    icon: 'quiz',
    tag: 'Test yourself',
    title: 'Quizzes',
    description:
      'Multiple choice with hints, explanations, and attempt history. Perfect for exam week.',
    accent: '#ffde59',
    placeholder:
      'https://placehold.co/620x400/14122c/ffde59/png?text=Quizzes',
  },
  {
    icon: 'slideshow',
    tag: 'One-click export',
    title: 'Slides (.pptx)',
    description:
      'Turn any set of pages into polished PowerPoint slides — ready to present.',
    accent: '#b9c3ff',
    placeholder:
      'https://placehold.co/620x400/12102a/b9c3ff/png?text=Slides',
  },
  {
    icon: 'account_tree',
    tag: 'Visual learning',
    title: 'Mind maps',
    description:
      'Hierarchies and connections auto-rendered from your notes via markmap.',
    accent: '#8ce5a7',
    placeholder:
      'https://placehold.co/620x400/0f0d24/8ce5a7/png?text=Mind+Maps',
  },
  {
    icon: 'event',
    tag: 'Stay accountable',
    title: 'Exam countdown',
    description:
      'Add exams, get daily goals, and watch a countdown that keeps you moving.',
    accent: '#fd6f85',
    placeholder:
      'https://placehold.co/620x400/1a1030/fd6f85/png?text=Countdown',
  },
  {
    icon: 'bolt',
    tag: 'Level up',
    title: 'XP + Streaks',
    description:
      'Earn XP for every page, quiz, and study session. Keep your streak alive.',
    accent: '#c9a6ff',
    placeholder:
      'https://placehold.co/620x400/160f2c/c9a6ff/png?text=XP',
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
  const scrollTo = useCallback(
    (i: number) => emblaApi?.scrollTo(i),
    [emblaApi]
  );

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
        background: '#09081a',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '0 32px' }}>
        <SectionHeader
          eyebrow="Study toolkit"
          title={
            <>
              All your study tools,{' '}
              <span
                style={{
                  background:
                    'linear-gradient(135deg, #ffde59 0%, #ffb347 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                one tap away.
              </span>
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
        <div style={{ display: 'flex', gap: 24 }}>
          {tools.map((t, i) => (
            <div
              key={t.title}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${tools.length}: ${t.title}`}
              style={{
                flex: '0 0 360px',
                maxWidth: 360,
                minWidth: 0,
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
                  background: active
                    ? 'var(--primary)'
                    : 'rgba(237, 233, 255, 0.18)',
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
        borderRadius: 'var(--radius-xl)',
        background:
          'linear-gradient(180deg, rgba(28, 24, 56, 0.7) 0%, rgba(16, 14, 34, 0.8) 100%)',
        border: `1px solid ${tool.accent}44`,
        overflow: 'hidden',
        transition:
          'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        boxShadow:
          '0 24px 60px rgba(140, 82, 255, 0.08), 0 8px 24px rgba(0,0,0,0.35)',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
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
      {/* Header preview */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '5 / 3',
          background: `radial-gradient(120% 80% at 50% 0%, ${tool.accent}22 0%, transparent 60%), #0d0c20`,
          overflow: 'hidden',
          borderBottom: `1px solid ${tool.accent}22`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tool.placeholder}
          alt={`${tool.title} preview`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
        {/* Icon badge */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-md)',
            background: 'rgba(8, 8, 22, 0.8)',
            border: `1px solid ${tool.accent}66`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: `0 4px 16px ${tool.accent}33`,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 22, color: tool.accent }}
          >
            {tool.icon}
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: 24 }}>
        <span
          style={{
            display: 'inline-block',
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
            fontSize: 14,
            lineHeight: 1.55,
            color: 'rgba(237, 233, 255, 0.58)',
            margin: '0 0 20px 0',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {tool.description}
        </p>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontFamily: 'var(--font-brand)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: tool.accent,
            fontWeight: 600,
          }}
        >
          Explore
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            arrow_forward
          </span>
        </div>
      </div>
    </div>
  );
}
