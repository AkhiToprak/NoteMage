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
    placeholder: '/screenshots/text_file_screenshot.png',
  },
  {
    eyebrow: 'Infinite canvas',
    title: 'Draw like a wizard',
    accent: '#ffde59',
    chromeLabel: '/notebooks/anatomy/canvas',
    placeholder: '/screenshots/canvas_screenshot.png',
  },
];

export default function HeroCarousel() {
  // Duplicate slides so the loop always feels busy + endless even with only
  // 3 unique cards. Embla's `loop` already wraps seamlessly — duplicating just
  // keeps neighbors in view during the wrap so you never see a "reset".
  const loopedSlides = [...slides, ...slides, ...slides];

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: true,
      align: 'center',
      containScroll: false,
      skipSnaps: false,
      startIndex: slides.length, // start in the middle copy for smoothest wrap
    },
    [Autoplay({ delay: 4200, stopOnInteraction: false, stopOnMouseEnter: true, stopOnFocusIn: true })]
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(slides.length + index),
    [emblaApi]
  );
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      // Map looped index back to the 3 unique slides for the progress pills
      const i = emblaApi.selectedScrollSnap();
      setSelectedIndex(i % slides.length);
    };
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

  const toggleAutoplay = useCallback(() => {
    const autoplay = emblaApi?.plugins()?.autoplay;
    if (!autoplay) return;
    if (autoplay.isPlaying()) autoplay.stop();
    else autoplay.play();
  }, [emblaApi]);

  // Respect reduced-motion (don't auto-rotate) and keep the button label in sync.
  useEffect(() => {
    const autoplay = emblaApi?.plugins()?.autoplay;
    if (!autoplay) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      autoplay.stop();
    }
    const sync = () => setIsPlaying(autoplay.isPlaying());
    sync();
    emblaApi.on('autoplay:play', sync).on('autoplay:stop', sync);
    return () => {
      emblaApi.off('autoplay:play', sync).off('autoplay:stop', sync);
    };
  }, [emblaApi]);

  return (
    <div className="hero-carousel" style={{ position: 'relative', width: '100%' }}>
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
          {loopedSlides.map((slide, i) => {
            const uniqueIndex = i % slides.length;
            return (
              <div
                key={i}
                className="hero-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`${uniqueIndex + 1} of ${slides.length}: ${slide.title}`}
                aria-hidden={i < slides.length || i >= slides.length * 2}
                style={{
                  minWidth: 0,
                  padding: '0 8px',
                }}
              >
                <MockFrame
                  image={slide.placeholder}
                  alt={`${slide.title} mockup`}
                  urlLabel={`notemage.app${slide.chromeLabel}`}
                  cornerLabel={slide.eyebrow}
                  accent={`${slide.accent}55`}
                  aspectRatio="3024 / 1668"
                />
              </div>
            );
          })}
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
                  background: active ? 'rgba(174, 137, 255, 0.18)' : 'transparent',
                  border: active
                    ? '1px solid rgba(174, 137, 255, 0.35)'
                    : '1px solid rgba(237, 233, 255, 0.14)',
                  color: active ? 'var(--on-surface)' : 'rgba(237, 233, 255, 0.45)',
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
          <button
            type="button"
            aria-label={isPlaying ? 'Pause auto-rotation' : 'Resume auto-rotation'}
            aria-pressed={!isPlaying}
            onClick={toggleAutoplay}
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
              transition: 'background 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(174, 137, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(174, 137, 255, 0.1)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
              {isPlaying ? 'pause' : 'play_arrow'}
            </span>
          </button>
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
                e.currentTarget.style.background = 'rgba(174, 137, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
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
        @media (max-width: 1023px) {
          .hero-slide {
            flex: 0 0 96%;
          }
        }
        @media (max-width: 767px) {
          .hero-slide {
            flex: 0 0 100%;
          }
        }
      `}</style>
    </div>
  );
}
