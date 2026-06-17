'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NMCard } from '@/components/rework/NMCard';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { TopicChip } from '@/components/rework/TopicChip';
import { Button } from '@/components/ui/Button';
import { Mascot } from '@/components/mascot/Mascot';

// ── types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

interface WizardState {
  // Step 1
  file: File | null;
  usingSample: boolean;
  pasteText: string;
  showPaste: boolean;
  // Step 3
  topics: string[];
  addingTopic: string;
  // Step 4
  examDate: string;
  intensity: 'easy' | 'balanced' | 'intense';
  hasExamDate: boolean;
}

// Representative topic chips for the sample material (cell biology)
const SAMPLE_TOPICS = [
  'Cell membrane',
  'Diffusion',
  'Osmosis',
  'Active transport',
  'Facilitated diffusion',
  'Transport proteins',
  'Concentration gradient',
  'Homeostasis',
];

const SAMPLE_FILE_NAME = 'Cell Biology — Transport Mechanisms.pdf';

const TOTAL_STEPS = 5;

// ── Step progress header ──────────────────────────────────────────────────────

function WizardHeader({
  step,
  onBack,
  onClose,
}: {
  step: Step;
  onBack: () => void;
  onClose: () => void;
}) {
  const pct = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 20px 0',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Back arrow */}
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          style={iconButtonStyle}
          onMouseEnter={(e) => applyHover(e, true)}
          onMouseLeave={(e) => applyHover(e, false)}
          onFocus={(e) => applyFocus(e, true)}
          onBlur={(e) => applyFocus(e, false)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            arrow_back
          </span>
        </button>

        {/* Step counter */}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            letterSpacing: '0.02em',
          }}
        >
          Step {step} of {TOTAL_STEPS}
        </span>

        {/* Close */}
        <button
          type="button"
          aria-label="Close wizard"
          onClick={onClose}
          style={iconButtonStyle}
          onMouseEnter={(e) => applyHover(e, true)}
          onMouseLeave={(e) => applyHover(e, false)}
          onFocus={(e) => applyFocus(e, true)}
          onBlur={(e) => applyFocus(e, false)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            close
          </span>
        </button>
      </div>

      <ProgressBar value={pct} height={4} />
    </div>
  );
}

// ── Step 1 — Upload material ──────────────────────────────────────────────────

function Step1Upload({
  state,
  onChange,
  onContinue,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onContinue: () => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const canContinue = state.file !== null || state.usingSample || state.pasteText.trim().length > 0;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onChange({ file: f, usingSample: false, showPaste: false });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) onChange({ file: f, usingSample: false, showPaste: false });
  }

  return (
    <StepWrapper>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <Mascot pose="holding-pen" size="md" idle="bounce" />
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-3xl)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-0.02em',
          lineHeight: 'var(--lh-tight)',
        }}
      >
        Create a Study Pack
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-base)',
          color: 'var(--on-surface-variant)',
          margin: '8px 0 0',
          textAlign: 'center',
          lineHeight: 'var(--lh-relaxed)',
        }}
      >
        Upload your material and we&apos;ll build a personalised learning path.
      </p>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload area — click to choose file or drag and drop"
        style={{
          padding: 'var(--card-pad)',
          border: `2px dashed ${dragging ? 'var(--accent-strong)' : 'var(--ink-20)'}`,
          background: dragging ? 'var(--ink-06)' : 'var(--surface-container-low)',
          cursor: 'pointer',
          borderRadius: 'var(--radius-lg)',
          transition: 'border-color var(--dur-fast) var(--ease-spring), background var(--dur-fast) var(--ease-spring)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          minHeight: 180,
          justifyContent: 'center',
          outline: 'none',
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onFocus={(e: React.FocusEvent<HTMLDivElement>) => { e.currentTarget.style.outline = '3px solid var(--accent-strong)'; e.currentTarget.style.outlineOffset = '2px'; }}
        onBlur={(e: React.FocusEvent<HTMLDivElement>) => { e.currentTarget.style.outline = 'none'; }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{
            fontSize: 40,
            color: state.file || state.usingSample ? 'var(--accent-strong)' : 'var(--on-surface-variant)',
            transition: 'color var(--dur-fast) var(--ease-spring)',
          }}
        >
          {state.file || state.usingSample ? 'task' : 'upload_file'}
        </span>

        {state.file ? (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              color: 'var(--on-surface)',
              fontWeight: 600,
              textAlign: 'center',
              wordBreak: 'break-all',
            }}
          >
            {state.file.name}
          </span>
        ) : state.usingSample ? (
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              color: 'var(--on-surface)',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {SAMPLE_FILE_NAME}
          </span>
        ) : (
          <>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--fs-sm)',
                color: 'var(--on-surface-variant)',
                margin: 0,
                textAlign: 'center',
                lineHeight: 1.5,
              }}
            >
              Drag your study material here
              <br />
              <span style={{ color: 'var(--ink-50)', fontSize: 'var(--fs-xs)' }}>
                PDF, PowerPoint, images, text, or Word documents
              </span>
            </p>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
          aria-label="Choose file to upload"
        />

        <Button
          variant="secondary"
          size="sm"
          leadingIcon="folder_open"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        >
          Choose file
        </Button>
      </div>

      {/* Paste text panel */}
      {state.showPaste && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            placeholder="Paste your notes or text here…"
            value={state.pasteText}
            onChange={(e) => onChange({ pasteText: e.target.value, usingSample: false, file: null })}
            rows={6}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-20)',
              background: 'var(--surface-container)',
              color: 'var(--on-surface)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--ink-20)'; }}
          />
        </div>
      )}

      {/* Secondary options */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={linkButtonStyle}
          onClick={() => onChange({ showPaste: !state.showPaste, usingSample: false })}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
          Paste text
        </button>
        <Link href="/tutorial" style={{ ...linkButtonStyle, textDecoration: 'none' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>science</span>
          Try a guided sample
        </Link>
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canContinue}
        trailingIcon="arrow_forward"
        onClick={onContinue}
        haptic="select"
      >
        Continue
      </Button>
    </StepWrapper>
  );
}

// ── Step 2 — Processing ───────────────────────────────────────────────────────

type ChecklistItem = { label: string; done: boolean; active: boolean };

function Step2Processing({ onDone }: { onDone: () => void }) {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const STEPS_TIMING = [0, 700, 1400, 2100]; // ms delays before each item marks done

  const [items, setItems] = React.useState<ChecklistItem[]>([
    { label: 'Extracting text', done: false, active: true },
    { label: 'Detecting topics', done: false, active: false },
    { label: 'Finding key concepts', done: false, active: false },
    { label: 'Building your learning path', done: false, active: false },
  ]);

  React.useEffect(() => {
    if (prefersReduced) {
      // Show all done instantly, advance immediately
      setItems((prev) => prev.map((it) => ({ ...it, done: true, active: false })));
      const t: number = window.setTimeout(onDone, 80);
      return () => window.clearTimeout(t);
    }

    const timers: number[] = [];

    STEPS_TIMING.forEach((delay, idx) => {
      timers.push(
        window.setTimeout(() => {
          setItems((prev) =>
            prev.map((it, i) => ({
              ...it,
              done: i <= idx,
              active: i === idx + 1,
            }))
          );
        }, delay + 400)
      );
    });

    // Advance to step 3 after all items are done
    timers.push(
      window.setTimeout(() => {
        setItems((prev) => prev.map((it) => ({ ...it, done: true, active: false })));
        onDone();
      }, 2600)
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StepWrapper>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <Mascot pose="thinking" size="lg" idle="float" />
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-2xl)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-0.02em',
        }}
      >
        Analysing your material…
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-sm)',
          color: 'var(--on-surface-variant)',
          margin: '4px 0 0',
          textAlign: 'center',
        }}
      >
        This only takes a moment.
      </p>

      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {items.map((item, i) => (
          <CheckRow key={i} item={item} />
        ))}
      </NMCard>
    </StepWrapper>
  );
}

function CheckRow({ item }: { item: ChecklistItem }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        opacity: item.done || item.active ? 1 : 0.4,
        transform: item.done || item.active ? 'translateX(0)' : 'translateX(-4px)',
        transition: 'opacity var(--dur-normal) var(--ease-spring), transform var(--dur-normal) var(--ease-spring)',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 20,
          color: item.done ? 'var(--success)' : item.active ? 'var(--accent-strong)' : 'var(--ink-30)',
          transition: 'color var(--dur-fast) var(--ease-spring)',
          flexShrink: 0,
        }}
      >
        {item.done ? 'check_circle' : item.active ? 'pending' : 'radio_button_unchecked'}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-base)',
          color: item.done ? 'var(--on-surface)' : item.active ? 'var(--on-surface)' : 'var(--on-surface-variant)',
          fontWeight: item.active ? 600 : 400,
          transition: 'color var(--dur-fast) var(--ease-spring), font-weight var(--dur-fast)',
        }}
      >
        {item.label}
      </span>
    </div>
  );
}

// ── Step 3 — Topic confirmation ───────────────────────────────────────────────

function Step3Topics({
  state,
  onChange,
  onContinue,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onContinue: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  function removeTopic(t: string) {
    onChange({ topics: state.topics.filter((x) => x !== t) });
  }

  function addTopic() {
    const val = state.addingTopic.trim();
    if (val && !state.topics.includes(val)) {
      onChange({ topics: [...state.topics, val], addingTopic: '' });
    } else {
      onChange({ addingTopic: '' });
    }
  }

  return (
    <StepWrapper>
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          We found {state.topics.length} topic{state.topics.length !== 1 ? 's' : ''}
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            margin: '6px 0 0',
            lineHeight: 1.6,
          }}
        >
          Does this look right? Remove topics you don&apos;t want, or add missing ones.
        </p>
      </div>

      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Chip grid */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {state.topics.map((topic) => (
            <TopicChip key={topic} label={topic} onRemove={() => removeTopic(topic)} />
          ))}
        </div>

        {/* Add topic input */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Add topic…"
            value={state.addingTopic}
            onChange={(e) => onChange({ addingTopic: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTopic(); }
            }}
            aria-label="Add a topic"
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-20)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              outline: 'none',
              minHeight: 36,
              transition: 'border-color var(--dur-fast) var(--ease-spring)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--ink-20)'; addTopic(); }}
          />
          <Button variant="ghost" size="sm" leadingIcon="add" onClick={addTopic} aria-label="Add topic">
            Add
          </Button>
        </div>
      </NMCard>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={state.topics.length === 0}
        trailingIcon="auto_awesome"
        onClick={onContinue}
        haptic="select"
      >
        Generate Path
      </Button>
    </StepWrapper>
  );
}

// ── Step 4 — Goal setup ───────────────────────────────────────────────────────

const INTENSITIES: { id: WizardState['intensity']; label: string; icon: string }[] = [
  { id: 'easy', label: 'Easy', icon: 'spa' },
  { id: 'balanced', label: 'Balanced', icon: 'balance' },
  { id: 'intense', label: 'Intense', icon: 'local_fire_department' },
];

function Step4Goal({
  state,
  onChange,
  onContinue,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onContinue: () => void;
}) {
  return (
    <StepWrapper>
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Set your goal
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            margin: '6px 0 0',
          }}
        >
          We&apos;ll pace the path around your schedule.
        </p>
      </div>

      {/* Exam date */}
      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-base)',
            fontWeight: 600,
            color: 'var(--on-surface)',
            margin: 0,
          }}
        >
          Do you have an exam date?
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <SegmentedOption
            active={!state.hasExamDate}
            onClick={() => onChange({ hasExamDate: false, examDate: '' })}
            label="No exam date"
          />
          <SegmentedOption
            active={state.hasExamDate}
            onClick={() => onChange({ hasExamDate: true })}
            label="Pick date"
          />
        </div>

        {state.hasExamDate && (
          <input
            type="date"
            value={state.examDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => onChange({ examDate: e.target.value })}
            aria-label="Exam date"
            style={{
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-20)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              outline: 'none',
              colorScheme: 'light dark',
              transition: 'border-color var(--dur-fast) var(--ease-spring)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--ink-20)'; }}
          />
        )}
      </NMCard>

      {/* Intensity */}
      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-base)',
            fontWeight: 600,
            color: 'var(--on-surface)',
            margin: 0,
          }}
        >
          Choose intensity
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {INTENSITIES.map(({ id, label, icon }) => (
            <IntensityOption
              key={id}
              id={id}
              label={label}
              icon={icon}
              active={state.intensity === id}
              onClick={() => onChange({ intensity: id })}
            />
          ))}
        </div>
      </NMCard>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        trailingIcon="arrow_forward"
        onClick={onContinue}
        haptic="select"
      >
        Continue
      </Button>
    </StepWrapper>
  );
}

function SegmentedOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        minHeight: 44,
        padding: '9px 12px',
        borderRadius: 'var(--radius-md)',
        border: active ? '2px solid var(--accent-strong)' : '1px solid var(--ink-20)',
        background: active ? 'var(--surface-container-high)' : hover ? 'var(--ink-08)' : 'transparent',
        color: active ? 'var(--accent-strong)' : 'var(--on-surface-variant)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-sm)',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'all var(--dur-fast) var(--ease-spring)',
      }}
    >
      {label}
    </button>
  );
}

function IntensityOption({
  id,
  label,
  icon,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={active}
      style={{
        flex: 1,
        minHeight: 56,
        padding: '10px 8px',
        borderRadius: 'var(--radius-md)',
        border: active ? '2px solid var(--accent-strong)' : '1px solid var(--ink-20)',
        background: active ? 'color-mix(in srgb, var(--accent-strong) 12%, transparent)' : hover ? 'var(--ink-08)' : 'transparent',
        color: active ? 'var(--accent-strong)' : 'var(--on-surface-variant)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-sm)',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        transition: 'all var(--dur-fast) var(--ease-spring)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </button>
  );
}

// ── Step 5 — Summary ──────────────────────────────────────────────────────────

function Step5Summary({
  state,
  onStartLesson,
  onViewPack,
}: {
  state: WizardState;
  onStartLesson: () => void;
  onViewPack: () => void;
}) {
  const packTitle = state.topics[0]
    ? `${state.topics[0]} & More`
    : state.file
    ? state.file.name.replace(/\.[^.]+$/, '')
    : 'My Study Pack';

  return (
    <StepWrapper>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <Mascot pose="graduation" size="lg" idle="bounce" oneShot="cheer-big" />
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-2xl)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-0.02em',
        }}
      >
        Your Study Pack is ready
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-sm)',
          color: 'var(--on-surface-variant)',
          margin: '4px 0 0',
          textAlign: 'center',
        }}
      >
        Start your first lesson whenever you&apos;re ready.
      </p>

      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Pack title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 28, color: 'var(--accent-strong)', flexShrink: 0 }}
          >
            auto_stories
          </span>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-lg)',
              fontWeight: 700,
              color: 'var(--on-surface)',
              margin: 0,
              lineHeight: 1.3,
            }}
          >
            {packTitle}
          </h3>
        </div>

        {/* Stats divider */}
        <div
          style={{
            height: 1,
            background: 'var(--ink-12)',
          }}
        />

        {/* Stat grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          <StatCell icon="route" label="Lessons" value="6" />
          <StatCell icon="style" label="Flashcards" value="24" />
          <StatCell icon="quiz" label="Quizzes" value="5" />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          <StatCell icon="emoji_events" label="Boss test" value="1" />
          <StatCell icon="schedule" label="Est. time" value="2h 30m" />
        </div>

        {/* Intensity badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 16, color: 'var(--on-surface-variant)' }}
          >
            {state.intensity === 'easy' ? 'spa' : state.intensity === 'intense' ? 'local_fire_department' : 'balance'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              color: 'var(--on-surface-variant)',
              textTransform: 'capitalize',
            }}
          >
            {state.intensity} pace
            {state.examDate ? ` · exam ${new Date(state.examDate + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}
          </span>
        </div>
      </NMCard>

      {/* Preview note — honest about representative numbers */}
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--ink-40)',
          textAlign: 'center',
          margin: 0,
        }}
      >
        Preview figures — final counts are generated from your material.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          leadingIcon="play_arrow"
          onClick={onStartLesson}
          haptic="success"
        >
          Start Lesson 1
        </Button>
        <Button
          variant="ghost"
          size="md"
          fullWidth
          leadingIcon="folder_open"
          onClick={onViewPack}
        >
          View Study Pack
        </Button>
      </div>
    </StepWrapper>
  );
}

function StatCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '10px 8px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-container-high)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-strong)' }}>
        {icon}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-lg)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--on-surface-variant)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Step wrapper ──────────────────────────────────────────────────────────────

function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--on-surface-variant)',
  transition: 'background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring)',
};

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  padding: '6px 10px',
  minHeight: 44,
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  color: 'var(--on-surface-variant)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 500,
  transition: 'color var(--dur-fast) var(--ease-spring), background var(--dur-fast) var(--ease-spring)',
};

function applyHover(e: React.MouseEvent<HTMLButtonElement>, on: boolean) {
  const el = e.currentTarget;
  el.style.background = on ? 'var(--ink-08)' : 'transparent';
  el.style.color = on ? 'var(--on-surface)' : 'var(--on-surface-variant)';
}

function applyFocus(e: React.FocusEvent<HTMLButtonElement>, on: boolean) {
  const el = e.currentTarget;
  el.style.outline = on ? '3px solid var(--accent-strong)' : 'none';
  el.style.outlineOffset = '2px';
}

// ── Animated step container ───────────────────────────────────────────────────

function AnimatedStep({ step, children }: { step: number; children: React.ReactNode }) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setVisible(true);
      return;
    }

    setVisible(false);
    const t = window.setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity var(--dur-normal) var(--ease-spring), transform var(--dur-normal) var(--ease-spring)',
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

// ── Root wizard component ─────────────────────────────────────────────────────

const DEFAULT_STATE: WizardState = {
  file: null,
  usingSample: false,
  pasteText: '',
  showPaste: false,
  topics: SAMPLE_TOPICS,
  addingTopic: '',
  examDate: '',
  intensity: 'balanced',
  hasExamDate: false,
};

export default function StudyPackNewPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [state, setState] = React.useReducer(
    (s: WizardState, patch: Partial<WizardState>) => ({ ...s, ...patch }),
    DEFAULT_STATE
  );

  function goBack() {
    if (step === 1) {
      router.push('/study-packs');
    } else {
      setStep((prev) => (prev - 1) as Step);
    }
  }

  function goClose() {
    router.push('/study-packs');
  }

  function advance() {
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS) as Step);
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <Step1Upload
            state={state}
            onChange={(p) => setState(p)}
            onContinue={advance}
          />
        );
      case 2:
        return <Step2Processing onDone={advance} />;
      case 3:
        return (
          <Step3Topics
            state={state}
            onChange={(p) => setState(p)}
            onContinue={advance}
          />
        );
      case 4:
        return (
          <Step4Goal
            state={state}
            onChange={(p) => setState(p)}
            onContinue={advance}
          />
        );
      case 5:
        return (
          <Step5Summary
            state={state}
            onStartLesson={() => router.push('/lesson/intro')}
            onViewPack={() => router.push('/study-packs')}
          />
        );
    }
  }

  return (
    <div
      className="nm-rework"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--background)',
        overflow: 'hidden',
      }}
    >
      {/* Progress header */}
      <WizardHeader step={step} onBack={goBack} onClose={goClose} />

      {/* Scrollable step body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 20px 40px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 640,
          }}
        >
          <AnimatedStep step={step}>
            {renderStep()}
          </AnimatedStep>
        </div>
      </div>
    </div>
  );
}
