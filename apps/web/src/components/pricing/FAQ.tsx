'use client';

import { useState } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_DATA: FAQItem[] = [
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes! You can upgrade or downgrade your plan anytime from your Settings page. Changes take effect immediately and your billing is prorated.',
  },
  {
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit and debit cards through Stripe, including Visa, Mastercard, and American Express. All payments are processed securely.',
  },
  {
    question: 'Is there a student discount?',
    answer:
      'Our pricing is already designed to be student-friendly — starting at just CHF 5/month for Plus. We believe great study tools should be accessible to everyone.',
  },
  {
    question: 'What happens when I hit my monthly limit?',
    answer:
      "You'll receive a notification when you're approaching your limit. Once reached, you can upgrade your plan to continue creating. Your existing content is never affected.",
  },
  {
    question: 'Can I cancel my subscription?',
    answer:
      "Absolutely. Cancel anytime from your Settings — no lock-in, no cancellation fees. You'll keep access until the end of your billing period.",
  },
];

function FAQAccordionItem({
  item,
  isOpen,
  onToggle,
  isRevealed,
  delay,
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
  isRevealed: boolean;
  delay: number;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{
        borderBottom: '1px solid rgba(85,85,120,0.12)',
        opacity: isRevealed ? 1 : 0,
        transform: isRevealed ? 'translateY(0)' : 'translateY(16px)',
        transition: `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      <button
        onClick={onToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-expanded={isOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '20px 0',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          color: hovered || isOpen ? 'var(--on-surface)' : 'var(--on-surface-variant)',
          fontSize: 16,
          fontWeight: 600,
          lineHeight: 1.4,
          transition: 'color 0.25s cubic-bezier(0.22,1,0.36,1)',
          position: 'relative',
        }}
      >
        {/* Left accent bar */}
        <span
          style={{
            position: 'absolute',
            left: -20,
            top: '50%',
            transform: `translateY(-50%) scaleY(${isOpen ? 1 : 0})`,
            width: 3,
            height: 24,
            borderRadius: 2,
            background: 'var(--primary)',
            transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
            transformOrigin: 'center',
          }}
        />

        <span>{item.question}</span>
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 22,
            color: 'var(--outline)',
            flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
            transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          expand_more
        </span>
      </button>

      {/* Collapsible answer — CSS Grid trick for smooth height */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <p
            style={{
              margin: 0,
              padding: '0 0 20px',
              fontSize: 15,
              lineHeight: 1.7,
              color: 'var(--on-surface-variant)',
              opacity: isOpen ? 0.8 : 0,
              transition: 'opacity 0.3s cubic-bezier(0.22,1,0.36,1)',
              transitionDelay: isOpen ? '80ms' : '0ms',
            }}
          >
            {item.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FAQ() {
  const { ref, isRevealed } = useScrollReveal();
  const [openIdx, setOpenIdx] = useState<number>(-1);

  return (
    <section
      ref={ref}
      style={{
        padding: '80px 40px',
        maxWidth: 720,
        margin: '0 auto',
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
          opacity: isRevealed ? 1 : 0,
          transform: isRevealed ? 'translateY(0)' : 'translateY(16px)',
          transition:
            'opacity 0.6s cubic-bezier(0.22,1,0.36,1), transform 0.6s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        Frequently asked questions
      </h2>

      <div style={{ paddingLeft: 20 }}>
        {FAQ_DATA.map((item, idx) => (
          <FAQAccordionItem
            key={idx}
            item={item}
            isOpen={openIdx === idx}
            onToggle={() => setOpenIdx(openIdx === idx ? -1 : idx)}
            isRevealed={isRevealed}
            delay={idx * 60}
          />
        ))}
      </div>
    </section>
  );
}
