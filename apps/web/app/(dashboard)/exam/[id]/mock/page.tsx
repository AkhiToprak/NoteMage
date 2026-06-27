'use client';

/* Hallmark · page: mock exam setup · genre: editorial · theme: project (cream AppShell)
 * states: type cards / chips / stepper / toggle / start button all carry
 *         hover · focus-visible · active · disabled
 * contrast: pass (cream `.shell` tokens only — no dark `--nm-*`)
 * Hallmark · pre-emit critique: P5 H4 E4 S4 R4 V4
 *
 * Exam Mode Phase 3 — "Set up a mock exam". Pick a type (quick / full / weak-spots /
 * final) then fine-tune count · time limit · question types · difficulty · hints,
 * and Mage assembles a sealed, timed rehearsal from the exam's scoped material.
 * Recent mocks list + empty state below. Honest copy — every recent-mock figure is
 * a real recorded score. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import s from './MockSetup.module.css';
import {
  defaultMockConfig,
  durationLabel,
  MOCK_DIFFICULTIES,
  MOCK_DIFFICULTY_LABEL,
  MOCK_KIND_LABEL,
  MOCK_SAFE_KINDS,
  MOCK_TYPE_PRESETS,
  MOCK_TYPES,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  type MockExamConfig,
  type MockType,
} from '@/lib/mock-exam-config';
import type { QuestionKind } from '@notemage/shared';

interface MockSummary {
  id: string;
  type: MockType;
  status: string;
  questionCount: number;
  durationSec: number;
  createdAt: string;
  score: number | null;
}

const DURATION_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90].map((m) => m * 60);

export default function MockSetupPage() {
  const params = useParams();
  const router = useRouter();
  const examId = Array.isArray(params?.id) ? params.id[0] : (params?.id ?? '');

  const [title, setTitle] = useState('Mock exam');
  const [config, setConfig] = useState<MockExamConfig>(() => defaultMockConfig('quick'));
  const [recent, setRecent] = useState<MockSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/user/exams/${examId}/mock`);
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const body = await res.json();
        if (cancelled) return;
        if (body?.data?.exam?.title) setTitle(body.data.exam.title);
        if (Array.isArray(body?.data?.mocks)) setRecent(body.data.mocks as MockSummary[]);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const pickType = useCallback((type: MockType) => {
    // Re-seed every fine-tune control to the archetype's preset.
    setConfig(defaultMockConfig(type));
    setError(null);
  }, []);

  const setCount = useCallback((delta: number) => {
    setConfig((c) => ({
      ...c,
      questionCount: Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, c.questionCount + delta)),
    }));
  }, []);

  const toggleKind = useCallback((kind: QuestionKind) => {
    setConfig((c) => {
      const has = c.questionKinds.includes(kind);
      // Never let the learner clear the last kind.
      if (has && c.questionKinds.length === 1) return c;
      return {
        ...c,
        questionKinds: has ? c.questionKinds.filter((k) => k !== kind) : [...c.questionKinds, kind],
      };
    });
  }, []);

  const start = useCallback(async () => {
    if (building) return;
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch(`/api/user/exams/${examId}/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { runUrl?: string }; error?: string }
        | null;
      const runUrl = json?.data?.runUrl;
      if (res.ok && json?.success && runUrl) {
        router.push(runUrl);
        return;
      }
      setError(
        res.status === 403
          ? 'Mock exams are a Pro feature.'
          : res.status === 429
            ? json?.error ?? 'You’ve used up your generation allowance for now.'
            : res.status === 400
              ? 'Add some paths or quizzes to this exam’s coverage first.'
              : json?.error ?? 'Mage couldn’t build a mock exam right now. Try again in a moment.',
      );
      setBuilding(false);
    } catch {
      setError('Network error — please try again.');
      setBuilding(false);
    }
  }, [building, examId, config, router]);

  const durationChoices = useMemo(
    () => (DURATION_CHOICES.includes(config.durationSec) || config.durationSec === 0
      ? DURATION_CHOICES
      : [config.durationSec, ...DURATION_CHOICES].sort((a, b) => a - b)),
    [config.durationSec],
  );

  return (
    <AppShell>
      <div className={s.page}>
        <Link href={`/exam/${examId}`} className={s.back}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>chevron_left</span>
          Back to exam
        </Link>

        <h1 className={s.title}>Set up a mock exam</h1>
        <p className={s.subtitle}>
          Rehearse <strong>{title}</strong> under timed conditions. Answers stay sealed until you
          submit — just like the real thing.
        </p>

        {/* ── Type ── */}
        <div className={s.sectionLabel}>Choose a type</div>
        <div className={s.typeGrid}>
          {MOCK_TYPES.map((type) => {
            const preset = MOCK_TYPE_PRESETS[type];
            const active = config.type === type;
            return (
              <button
                key={type}
                type="button"
                className={`${s.typeCard} ${active ? s.typeCardActive : ''}`}
                onClick={() => pickType(type)}
                aria-pressed={active}
              >
                <span className={s.typeIcon}>
                  <span className="material-symbols-outlined" aria-hidden>{preset.icon}</span>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className={s.typeName}>{preset.label}</span>
                  <p className={s.typeBlurb}>{preset.blurb}</p>
                  <span className={s.typeMeta}>
                    {preset.questionCount} questions · {durationLabel(preset.durationSec)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Fine-tune ── */}
        <div className={s.sectionLabel}>Fine-tune</div>
        <div className={s.card}>
          {/* Questions */}
          <div className={s.row}>
            <span className={s.rowLabel}>
              <span className={s.rowTitle}>Questions</span>
              <span className={s.rowHint}>How many to generate ({MIN_QUESTIONS}–{MAX_QUESTIONS})</span>
            </span>
            <span className={s.stepper}>
              <button
                type="button"
                className={s.stepBtn}
                onClick={() => setCount(-1)}
                disabled={config.questionCount <= MIN_QUESTIONS}
                aria-label="Fewer questions"
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>remove</span>
              </button>
              <span className={s.stepValue} aria-live="polite">{config.questionCount}</span>
              <button
                type="button"
                className={s.stepBtn}
                onClick={() => setCount(1)}
                disabled={config.questionCount >= MAX_QUESTIONS}
                aria-label="More questions"
              >
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>add</span>
              </button>
            </span>
          </div>

          {/* Time limit */}
          <div className={s.row}>
            <span className={s.rowLabel}>
              <span className={s.rowTitle}>Time limit</span>
              <span className={s.rowHint}>The clock auto-submits at zero</span>
            </span>
            <div className={s.chips}>
              {durationChoices.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`${s.chip} ${config.durationSec === sec ? s.chipActive : ''}`}
                  onClick={() => setConfig((c) => ({ ...c, durationSec: sec }))}
                  aria-pressed={config.durationSec === sec}
                >
                  {durationLabel(sec)}
                </button>
              ))}
              <button
                type="button"
                className={`${s.chip} ${config.durationSec === 0 ? s.chipActive : ''}`}
                onClick={() => setConfig((c) => ({ ...c, durationSec: 0 }))}
                aria-pressed={config.durationSec === 0}
              >
                No limit
              </button>
            </div>
          </div>

          {/* Question types */}
          <div className={s.row}>
            <span className={s.rowLabel}>
              <span className={s.rowTitle}>Question types</span>
              <span className={s.rowHint}>At least one</span>
            </span>
            <div className={s.chips}>
              {MOCK_SAFE_KINDS.map((kind) => {
                const on = config.questionKinds.includes(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    className={`${s.chip} ${on ? s.chipActive : ''}`}
                    onClick={() => toggleKind(kind)}
                    aria-pressed={on}
                  >
                    {on ? (
                      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15, marginRight: 4, verticalAlign: '-2px' }}>check</span>
                    ) : null}
                    {MOCK_KIND_LABEL[kind]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty */}
          <div className={s.row}>
            <span className={s.rowLabel}>
              <span className={s.rowTitle}>Difficulty</span>
              <span className={s.rowHint}>How hard Mage pitches the questions</span>
            </span>
            <div className={s.chips}>
              {MOCK_DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${s.chip} ${config.difficulty === d ? s.chipActive : ''}`}
                  onClick={() => setConfig((c) => ({ ...c, difficulty: d }))}
                  aria-pressed={config.difficulty === d}
                >
                  {MOCK_DIFFICULTY_LABEL[d]}
                </button>
              ))}
            </div>
          </div>

          {/* Hints */}
          <div className={s.row}>
            <span className={s.rowLabel}>
              <span className={s.rowTitle}>Allow hints</span>
              <span className={s.rowHint}>Off is more exam-realistic</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={config.hints}
              aria-label="Allow hints"
              className={`${s.toggle} ${config.hints ? s.toggleOn : ''}`}
              onClick={() => setConfig((c) => ({ ...c, hints: !c.hints }))}
            >
              <span className={s.toggleKnob} />
            </button>
          </div>
        </div>

        {/* ── Start ── */}
        <div className={s.startWrap}>
          {error ? <p role="alert" className={s.err}>{error}</p> : null}
          <button
            type="button"
            className={`${ui.btn} ${ui.primary} ${s.startBtn}`}
            onClick={start}
            disabled={building}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>fort</span>
            {building ? 'Building your mock…' : 'Start mock exam'}
          </button>
          <span className={s.proNote}>
            {config.durationSec > 0
              ? `${config.questionCount} questions · ${durationLabel(config.durationSec)} · sealed until you submit`
              : `${config.questionCount} questions · untimed · sealed until you submit`}
          </span>
        </div>

        {/* ── Recent mocks ── */}
        <div className={s.sectionLabel}>Recent mocks</div>
        {!loaded ? (
          <p className={s.rowHint}>Loading…</p>
        ) : recent.length === 0 ? (
          <div className={s.empty}>
            No mock exams yet. Your first rehearsal starts above — Mage builds it from this exam’s
            material and grades it the moment you submit.
          </div>
        ) : (
          <div className={s.recent}>
            {recent.map((m) => {
              const preset = MOCK_TYPE_PRESETS[m.type] ?? MOCK_TYPE_PRESETS.quick;
              const done = m.status === 'completed';
              const href = done
                ? `/exam/${examId}/mock/${m.id}/results`
                : `/exam/${examId}/mock/${m.id}`;
              return (
                <Link key={m.id} href={href} className={s.mockRow}>
                  <span
                    className={s.mockScore}
                    style={
                      done && m.score != null
                        ? { background: m.score >= 70 ? 'var(--green-soft, #e3f3e6)' : 'var(--rc, #f1ebe0)', color: m.score >= 70 ? 'var(--green, #2f8f4e)' : 'var(--ink)' }
                        : undefined
                    }
                  >
                    {done && m.score != null ? `${Math.round(m.score)}%` : (
                      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 22 }}>
                        {done ? 'help' : 'fort'}
                      </span>
                    )}
                  </span>
                  <span className={s.mockMain}>
                    <span className={s.mockTitle}>{preset.label}</span>
                    <span className={s.mockSub}>
                      {m.questionCount} questions · {durationLabel(m.durationSec)}
                      {done ? '' : m.status === 'ready' ? ' · ready to start' : ' · in progress'}
                    </span>
                  </span>
                  <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 22, color: 'var(--muted)' }}>
                    chevron_right
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
