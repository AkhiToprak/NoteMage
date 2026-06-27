/* eslint-disable @next/next/no-img-element */
'use client';

import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import styles from '@/components/onboarding/SampleStep.module.css';
import { resetSampleRun } from '@/lib/sample-run';
import {
  subscribePreview,
  getPreviewSnapshot,
  getPreviewServerSnapshot,
  type StoredPreview,
} from '@/lib/onboarding-preview-store';

/* Figma "W08 Study session" (node 14:875) — the first lesson. Real-generation P3:
   when a preview exists, this renders the actual slot-1 lesson (title, short
   explanation, one worked example, key idea); otherwise it shows the illustrative
   SQL sample. "Start quiz" → W09, which reads the matching questions. */

function lessonSource(kind: StoredPreview['sourceKind'], title: string): string {
  if (kind === 'link') return 'Your video';
  if (kind === 'notes') return 'Your notes';
  return title || 'Your material';
}

export default function SessionPage() {
  const router = useRouter();
  const preview = useSyncExternalStore(subscribePreview, getPreviewSnapshot, getPreviewServerSnapshot);

  const onStart = () => {
    resetSampleRun();
    router.push('/start/quiz');
  };

  const lesson = preview?.lesson ?? null;

  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden>
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </span>
      <button type="button" className={styles.back} onClick={() => router.back()} aria-label="Back">
        <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
      </button>

      <div className={styles.wrap}>
        <h1 className={styles.heading}>{lesson ? lesson.title : 'Database basics'}</h1>
        <p className={styles.sub}>First section · 3 min</p>

        <div className={styles.bubbleRow}>
          <span className={styles.avatar}><img src="/landing/mage-plain.png" alt="" aria-hidden /></span>
          <span className={styles.bubble}>Let&apos;s start small. Read this, then I&apos;ll check your understanding with 2 quick questions.</span>
        </div>

        <div className={styles.lesson}>
          <p className={styles.kicker}>Short explanation</p>
          {lesson ? (
            <>
              <p className={styles.lessonBody}>{lesson.intro}</p>
              {lesson.example && (
                <div className={styles.example}>
                  <p className={styles.exampleLabel}>EXAMPLE</p>
                  <p className={styles.exampleText}>
                    {lesson.example.label ? `${lesson.example.label} — ${lesson.example.text}` : lesson.example.text}
                  </p>
                </div>
              )}
              <span className={styles.cite}>
                <span className="material-symbols-outlined" aria-hidden>description</span>
                Source: {lessonSource(preview!.sourceKind, preview!.title)}
              </span>
            </>
          ) : (
            <>
              <p className={styles.lessonBody}>
                Databases store related information in a structured way. Instead of keeping everything in one long
                document, data is organized into tables, rows, and columns.
              </p>
              <div className={styles.example}>
                <p className={styles.exampleLabel}>EXAMPLE</p>
                <p className={styles.exampleText}>
                  A student database can store students, classes, grades, and teachers in separate tables.
                </p>
              </div>
              <span className={styles.cite}>
                <span className="material-symbols-outlined" aria-hidden>description</span>
                Source: Sample SQL Notes · page 2
              </span>
            </>
          )}
        </div>

        <div className={styles.keyIdea}>
          <span className={styles.keyBar} aria-hidden />
          <p className={styles.keyLabel}>KEY IDEA</p>
          <p className={styles.keyText}>
            {lesson && lesson.keyIdea
              ? lesson.keyIdea
              : 'Tables organize data. Rows represent records. Columns represent attributes.'}
          </p>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.primaryBtn} onClick={onStart}>
            Start quiz
          </button>
        </div>
      </div>
    </div>
  );
}
