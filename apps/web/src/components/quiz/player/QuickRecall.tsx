'use client';

/* Hallmark · component: quick-recall reveal · genre: editorial · theme: project (cream / --quiz-* + --nm-* tokens)
 * states: reveal button has default · hover · focus-visible · active; toggles to a revealed answer
 * contrast: pass (semantic tokens only — theme-flipping cream↔navy, no inline hex)
 *
 * The "Quick recall" self-check card under a theory lesson (Figma "Quiz screens"
 * — theory). One question, hidden answer, "Reveal answer" → fades the answer in.
 * The Q/A is the slot's first sibling flashcard (generated from this exact
 * theory), so it primes the learner for the Practice step without a new schema.
 */

import { useState } from 'react';

export default function QuickRecall({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <section
      style={{
        background: 'var(--quiz-card)',
        border: '1px solid var(--quiz-card-border)',
        borderRadius: 'var(--radius-xl)',
        padding: '22px 24px',
        boxShadow: '0 1px 2px rgb(15 15 30 / 0.04), 0 14px 34px rgb(15 15 30 / 0.05)',
        width: '100%',
      }}
    >
      <style>{`
        .nm-recall-reveal { transition: background-color 0.15s var(--ease-spring), border-color 0.15s var(--ease-spring), transform 0.15s var(--ease-spring); }
        .nm-recall-reveal:hover { background: var(--nm-primary-light); border-color: var(--nm-primary); }
        .nm-recall-reveal:active { transform: translateY(1px); }
        .nm-recall-reveal:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
        .nm-recall-answer { animation: nmRecallIn 0.26s var(--ease-spring) both; }
        @keyframes nmRecallIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .nm-recall-hide { transition: color 0.15s var(--ease-spring); }
        .nm-recall-hide:hover { color: var(--on-surface); }
        .nm-recall-hide:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; border-radius: var(--radius-sm); }
        @media (prefers-reduced-motion: reduce) {
          .nm-recall-reveal { transition: none; }
          .nm-recall-reveal:active { transform: none; }
          .nm-recall-answer { animation: none; }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 11px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--nm-primary-light)',
            color: 'var(--nm-primary-on-light)',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
            psychology
          </span>
          Quick recall
        </span>
        <span style={{ flexShrink: 0, fontSize: '12px', fontWeight: 600, color: 'var(--on-surface-variant)' }}>
          1 question
        </span>
      </div>

      <p
        style={{
          margin: '0 0 16px',
          fontSize: '16px',
          fontWeight: 600,
          lineHeight: 1.5,
          color: 'var(--on-surface)',
        }}
      >
        {question}
      </p>

      {revealed ? (
        <div className="nm-recall-answer">
          <div
            style={{
              borderRadius: 'var(--radius-md)',
              background: 'var(--nm-primary-light)',
              border: '1px solid var(--nm-primary)',
              padding: '14px 16px',
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--nm-primary-on-light)',
                marginBottom: '5px',
              }}
            >
              Answer
            </span>
            <span style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--on-surface)' }}>{answer}</span>
          </div>
          <button
            type="button"
            onClick={() => setRevealed(false)}
            className="nm-recall-hide"
            style={{
              marginTop: '10px',
              padding: '2px 0',
              background: 'transparent',
              border: 'none',
              color: 'var(--on-surface-variant)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Hide answer
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="nm-recall-reveal"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '11px 20px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--nm-primary)',
            background: 'transparent',
            color: 'var(--nm-primary-on-light)',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
            visibility
          </span>
          Reveal answer
        </button>
      )}
    </section>
  );
}
