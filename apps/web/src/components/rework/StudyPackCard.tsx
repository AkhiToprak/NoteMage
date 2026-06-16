'use client';

import * as React from 'react';
import { NMCard } from './NMCard';
import { ProgressBar } from './ProgressBar';
import { WeakTopicChip } from './WeakTopicChip';
import { readinessColor } from './tokens';
import { Button } from '@/components/ui/Button';

export interface StudyPackCardProps {
  title: string;
  subject?: string;
  lessons?: number;
  flashcards?: number;
  quizzes?: number;
  /** 0–100 readiness score */
  readiness?: number;
  weakTopics?: string[];
  progress?: number;
  href: string;
  accentColor?: string;
}

export function StudyPackCard({
  title,
  subject,
  lessons,
  flashcards,
  quizzes,
  readiness,
  weakTopics = [],
  progress,
  href,
  accentColor = 'var(--brand-purple)',
}: StudyPackCardProps) {
  // Build the meta string — omit zeroes / undefined
  const metaParts: string[] = [];
  if (lessons) metaParts.push(`${lessons} lesson${lessons !== 1 ? 's' : ''}`);
  if (flashcards) metaParts.push(`${flashcards} flashcard${flashcards !== 1 ? 's' : ''}`);
  if (quizzes) metaParts.push(`${quizzes} quiz${quizzes !== 1 ? 'zes' : ''}`);

  const visibleWeakTopics = weakTopics.slice(0, 2);

  return (
    <NMCard
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {/* Top row: subject dot + label */}
      {subject && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: accentColor,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--on-surface-variant)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {subject}
          </span>
        </div>
      )}

      {/* Title */}
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-lg)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          margin: 0,
          lineHeight: 1.25,
        }}
      >
        {title}
      </h3>

      {/* Meta line */}
      {metaParts.length > 0 && (
        <p
          style={{
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            fontFamily: 'var(--font-sans)',
            margin: 0,
          }}
        >
          {metaParts.join(' · ')}
        </p>
      )}

      {/* Readiness */}
      {readiness != null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: 'var(--fs-sm)',
              color: 'var(--on-surface-variant)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Readiness {Math.round(readiness)}%
          </span>
          <ProgressBar
            value={readiness}
            color={readinessColor(readiness)}
            height={6}
          />
        </div>
      )}

      {/* Progress (if no readiness) */}
      {readiness == null && progress != null && (
        <ProgressBar value={progress} height={6} />
      )}

      {/* Weak topics — display-only pills, no navigation */}
      {visibleWeakTopics.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {visibleWeakTopics.map((topic) => (
            <WeakTopicChip key={topic} topic={topic} />
          ))}
        </div>
      )}

      {/* Footer CTA — the single navigable control on this card */}
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        <Button href={href} variant="primary" size="md" shape="pill" fullWidth trailingIcon="arrow_forward">
          Continue
        </Button>
      </div>
    </NMCard>
  );
}

export default StudyPackCard;
