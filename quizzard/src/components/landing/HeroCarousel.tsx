'use client';

import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import MockFrame from './MockFrame';

interface Slide {
  title: string;
  eyebrow: string;
  accent: string;
  placeholder: string;
  chromeLabel: string;
}

const slides: Slide[] = [
  {
    eyebrow: 'Text notes',
    title: 'Write like a human',
    accent: '#ae89ff',
    chromeLabel: '/notebooks/algebra',
    placeholder:
      'https://placehold.co/1280x780/14122c/ae89ff/png?text=Text+Notes+Mockup',
  },
  {
    eyebrow: 'Infinite canvas',
    title: 'Draw like a wizard',
    accent: '#ffde59',
    chromeLabel: '/notebooks/anatomy/canvas',
    placeholder:
      'https://placehold.co/1280x780/0f0d24/ffde59/png?text=Infinite+Canvas+Mockup',
  },
  {
    eyebrow: 'Split view',
    title: 'Both, side-by-side',
    accent: '#b9c3ff',
    chromeLabel: '/notebooks/chemistry',
    placeholder:
      'https://placehold.co/1280x780/12102a/b9c3ff/png?text=Split+View+Mockup',
  },
];

export default function HeroCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'center',
      containScroll: false,
      skipSnaps: false,
    },
    [Autoplay({ delay: 5000, stopOnInteraction: false, stopOnMouseEnter: true })]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') scrollPrev();
      if (e.key === 'ArrowRight') scrollNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scrollPrev, scrollNext]);

  return (
    <div className="hero-carousel" style={{ position: 'relative', width: '100%' }}>
      {/* Floating stickers for depth — hidden on mobile */}
      <div
        aria-hidden
        className="hero-sticker hero-sticker-tl"
        style={{
          position: 'absolute',
          top: -32,
          left: -28,
          zIndex: 3,
          padding: '10px 16px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(20, 18, 44, 0.88)',
          border: '1px solid rgba(255, 222, 89, 0.35)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow:
            '0 16px 40px rgba(255, 222, 89, 0.1), 0 4px 12px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'nm-float 6s ease-in-out infinite',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: '#ffde59' }}
        >
          auto_awesome
        </span>
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: '#ffde59',
          }}
        >
          Mage is typing…
        </span>
      </div>

      <div
        aria-hidden
        className="hero-sticker hero-sticker-tr"
        style={{
          position: 'absolute',
          top: 42,
          right: -32,
          zIndex: 3,
          padding: '10px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(20, 18, 44, 0.88)',
          border: '1px solid rgba(174, 137, 255, 0.35)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'nm-float 7s ease-in-out infinite 1.2s',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#8ce5a7',
            boxShadow: '0 0 10px #8ce5a7',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(237, 233, 255, 0.78)',
          }}
        >
          3 friends studying
        </span>
      </div>

      <div
        aria-hidden
        className="hero-sticker hero-sticker-bl"
        style={{
          position: 'absolute',
          bottom: -28,
          left: 44,
          zIndex: 3,
          padding: '10px 14px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(20, 18, 44, 0.88)',
          border: '1px solid rgba(174, 137, 255, 0.35)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          animation: 'nm-float 8s ease-in-out infinite 0.6s',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: 'var(--primary)' }}
        >
          quiz
        </span>
        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(237, 233, 255, 0.78)',
          }}
        >
          Quiz generated in 4s
        </span>
      </div>

      {/* Embla viewport */}
      <div
        ref={emblaRef}
        style={{
          overflow: 'hidden',
          padding: '8px 0 8px',
          margin: '0 -8px',
        }}
        aria-roledescription="carousel"
        aria-label="Notemage product showcase"
      >
        <div style={{ display: 'flex', gap: 0 }}>
          {slides.map((slide, i) => (
            <div
              key={i}
              className="hero-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}: ${slide.title}`}
              style={{
                minWidth: 0,
                padding: '0 8px',
                transform:
                  i === selectedIndex ? 'scale(1)' : 'scale(0.95)',
                opacity: i === selectedIndex ? 1 : 0.55,
                transition:
                  'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <MockFrame
                image={slide.placeholder}
                alt={`${slide.title} mockup`}
                urlLabel={`notemage.app${slide.chromeLabel}`}
                cornerLabel={slide.eyebrow}
                accent={`${slide.accent}55`}
                aspectRatio="16 / 10"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Controls row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 36,
          padding: '0 8px',
          gap: 24,
        }}
      >
        {/* Progress pills */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {slides.map((slide, i) => {
            const active = i === selectedIndex;
            return (
              <button
                key={i}
                type="button"
                onClick={() => scrollTo(i)}
                aria-label={`Go to slide ${i + 1}: ${slide.title}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: active ? '8px 16px' : '8px',
                  borderRadius: 'var(--radius-full)',
                  background: active
                    ? 'rgba(174, 137, 255, 0.18)'
                    : 'transparent',
                  border: active
                    ? '1px solid rgba(174, 137, 255, 0.35)'
                    : '1px solid rgba(237, 233, 255, 0.14)',
                  color: active
                    ? 'var(--on-surface)'
                    : 'rgba(237, 233, 255, 0.45)',
                  fontSize: 11,
                  fontFamily: 'var(--font-brand)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition:
                    'background 0.35s cubic-bezier(0.22, 1, 0.36, 1), color 0.35s cubic-bezier(0.22, 1, 0.36, 1), padding 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: active ? slide.accent : 'rgba(237,233,255,0.35)',
                    boxShadow: active ? `0 0 10px ${slide.accent}` : 'none',
                  }}
                />
                {active && <span>{slide.eyebrow}</span>}
              </button>
            );
          })}
        </div>

        {/* Arrow buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'Previous slide', icon: 'arrow_back', onClick: scrollPrev },
            { label: 'Next slide', icon: 'arrow_forward', onClick: scrollNext },
          ].map((b) => (
            <button
              key={b.icon}
              type="button"
              aria-label={b.label}
              onClick={b.onClick}
              style={{
                width: 46,
                height: 46,
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

      <style jsx global>{`
        .hero-slide {
          flex: 0 0 92%;
        }
        @keyframes nm-float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }
        @media (max-width: 1023px) {
          .hero-slide {
            flex: 0 0 96%;
          }
        }
        @media (max-width: 767px) {
          .hero-slide {
            flex: 0 0 100%;
          }
          .hero-sticker {
            display: none !important;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-sticker {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
