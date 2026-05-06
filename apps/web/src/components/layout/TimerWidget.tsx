'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useTimer } from '@/contexts/TimerContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/* ═══════════════════════════════════════════════════════════════════════════
   TimerWidget — Compact topbar/sidebar timer with glass-morphism dropdown
   ═══════════════════════════════════════════════════════════════════════════ */

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const C = {
  pageBg: '#1a1a36',
  cardBg: 'rgba(33, 33, 62,0.92)',
  elevated: '#2d2d52',
  inputBg: '#35355c',
  surfaceBright: '#3e3e68',
  primary: '#ae89ff',
  primaryDim: '#884efb',
  primaryGlow: 'rgba(174,137,255,0.15)',
  breakColor: '#5ee6a0',
  breakGlow: 'rgba(94,230,160,0.15)',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: 'rgba(85,85,120,0.5)',
} as const;

type TabKey = 'countdown' | 'pomodoro' | 'stopwatch';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'countdown', label: 'Timer', icon: 'hourglass_top' },
  { key: 'pomodoro', label: 'Pomodoro', icon: 'self_improvement' },
  { key: 'stopwatch', label: 'Stopwatch', icon: 'timer' },
];

interface Props {
  compact?: boolean;
}

export default function TimerWidget({ compact }: Props) {
  const timer = useTimer();
  const { isPhone } = useBreakpoint();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [fixedPos, setFixedPos] = useState<{ top: number; left: number } | null>(null);

  // Compute fixed position for compact (sidebar) mode
  useEffect(() => {
    if (open && compact && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setFixedPos({ top: rect.top, left: rect.right + 8 });
    }
    if (!open) setFixedPos(null);
  }, [open, compact]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Current accent color based on mode + phase
  const accent =
    timer.mode === 'pomodoro' && timer.pomodoroPhase === 'break' ? C.breakColor : C.primary;
  const accentGlow =
    timer.mode === 'pomodoro' && timer.pomodoroPhase === 'break' ? C.breakGlow : C.primaryGlow;

  const showTimeInButton = timer.isRunning && !isPhone;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* ── Trigger button ──────────────────────────────────────── */}
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          height: 36,
          minWidth: 36,
          padding: showTimeInButton ? '0 12px 0 8px' : 0,
          borderRadius: 10,
          border: `1px solid ${
            timer.isRunning
              ? `${accent}33`
              : hovered || open
                ? 'rgba(255,255,255,0.06)'
                : 'transparent'
          }`,
          background:
            hovered || open
              ? timer.isRunning
                ? `${accent}18`
                : 'rgba(255,255,255,0.05)'
              : timer.isRunning
                ? `${accent}0a`
                : 'transparent',
          color: timer.isRunning ? accent : hovered || open ? C.textPrimary : C.textMuted,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          flexShrink: 0,
          transition: `background 0.2s ${EASING}, color 0.2s ${EASING}, border-color 0.2s ${EASING}`,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 20,
            transition: `transform 0.2s ${EASING}`,
            transform: hovered ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          timer
        </span>
        {showTimeInButton && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'var(--font-display), monospace',
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}
          >
            {timer.displayTime}
          </span>
        )}
        {timer.isRunning && (
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: accent,
              flexShrink: 0,
              boxShadow: `0 0 6px ${accent}`,
              animation: 'twPulse 2s ease-in-out infinite',
            }}
          />
        )}
      </button>

      {/* ── Global keyframes ───────────────────────────────────── */}
      <style>{`
        @keyframes twPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.8); }
        }
        @keyframes twDropIn {
          from { opacity: 0; transform: ${compact ? 'translateX(-4px)' : 'translateY(-4px)'} scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes twRingPulse {
          0%, 100% { filter: drop-shadow(0 0 3px ${C.primary}44); }
          50% { filter: drop-shadow(0 0 8px ${C.primary}66); }
        }
        /* Hide number input spinners */
        .tw-num::-webkit-outer-spin-button,
        .tw-num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .tw-num { -moz-appearance: textfield; }
      `}</style>

      {/* ── Dropdown ────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: compact ? 'fixed' : 'absolute',
            ...(compact && fixedPos
              ? { top: fixedPos.top, left: fixedPos.left }
              : !compact
                ? { top: '100%', marginTop: 8, right: 0 }
                : {}),
            width: isPhone ? 'calc(100vw - 24px)' : 310,
            maxWidth: 340,
            background: C.cardBg,
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: `1px solid ${C.border}`,
            borderRadius: 18,
            boxShadow: `
              0 20px 60px rgba(0,0,0,0.5),
              0 0 0 1px rgba(174,137,255,0.04),
              0 0 80px rgba(174,137,255,0.04)
            `,
            zIndex: 200,
            animation: `twDropIn 0.2s ${EASING}`,
            overflow: 'hidden',
          }}
        >
          {/* Mode tabs */}
          <div
            style={{
              display: 'flex',
              gap: 2,
              padding: '10px 10px 0',
              background: 'rgba(0,0,0,0.15)',
            }}
          >
            {TABS.map((tab) => {
              const active = timer.mode === tab.key;
              const isHov = hoveredTab === tab.key;
              const disabled = timer.isRunning && !active;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    if (!disabled) timer.setMode(tab.key);
                  }}
                  onMouseEnter={() => setHoveredTab(tab.key)}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{
                    flex: 1,
                    padding: '8px 0 10px',
                    borderRadius: '10px 10px 0 0',
                    border: 'none',
                    borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
                    background: active
                      ? 'rgba(174,137,255,0.08)'
                      : isHov && !disabled
                        ? 'rgba(255,255,255,0.03)'
                        : 'transparent',
                    color: active
                      ? C.textPrimary
                      : isHov && !disabled
                        ? C.textSecondary
                        : C.textMuted,
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    letterSpacing: '0.01em',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.35 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    transition: `background 0.15s ${EASING}, color 0.15s ${EASING}, border-color 0.15s ${EASING}, opacity 0.15s ${EASING}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div style={{ padding: '16px 16px 14px' }}>
            {/* ── Countdown ──────────────────────────────────── */}
            {timer.mode === 'countdown' && (
              <CountdownPanel timer={timer} hoveredBtn={hoveredBtn} setHoveredBtn={setHoveredBtn} />
            )}

            {/* ── Pomodoro ───────────────────────────────────── */}
            {timer.mode === 'pomodoro' && (
              <PomodoroPanel
                timer={timer}
                accent={accent}
                accentGlow={accentGlow}
                hoveredBtn={hoveredBtn}
                setHoveredBtn={setHoveredBtn}
              />
            )}

            {/* ── Stopwatch ──────────────────────────────────── */}
            {timer.mode === 'stopwatch' && (
              <StopwatchPanel timer={timer} hoveredBtn={hoveredBtn} setHoveredBtn={setHoveredBtn} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Mode Panels
   ═══════════════════════════════════════════════════════════════════════════ */

function CountdownPanel({
  timer,
  hoveredBtn,
  setHoveredBtn,
}: {
  timer: ReturnType<typeof useTimer>;
  hoveredBtn: string | null;
  setHoveredBtn: (v: string | null) => void;
}) {
  return (
    <div>
      <TimeDisplay
        time={timer.displayTime}
        isRunning={timer.isRunning}
        color={timer.isRunning ? C.primary : C.textPrimary}
        size={38}
      />

      {!timer.isRunning && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <NumberInput
            label="Hours"
            value={timer.countdownHours}
            onChange={timer.setCountdownHours}
            min={0}
            max={23}
          />
          <NumberInput
            label="Minutes"
            value={timer.countdownMinutes}
            onChange={timer.setCountdownMinutes}
            min={0}
            max={59}
          />
        </div>
      )}

      <ActionButtons
        isRunning={timer.isRunning}
        onStart={timer.start}
        onPause={timer.pause}
        onReset={timer.reset}
        accent={C.primary}
        hoveredBtn={hoveredBtn}
        setHoveredBtn={setHoveredBtn}
      />
    </div>
  );
}

function PomodoroPanel({
  timer,
  accent,
  accentGlow,
  hoveredBtn,
  setHoveredBtn,
}: {
  timer: ReturnType<typeof useTimer>;
  accent: string;
  accentGlow: string;
  hoveredBtn: string | null;
  setHoveredBtn: (v: string | null) => void;
}) {
  const isWork = timer.pomodoroPhase === 'work';

  // Compute progress for the ring (0 to 1)
  const progress = useMemo(() => {
    if (!timer.isRunning) return 0;
    const parts = timer.displayTime.split(':').map(Number);
    let remainSec = 0;
    if (parts.length === 3) remainSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else remainSec = parts[0] * 60 + parts[1];
    const totalSec = isWork ? timer.pomodoroWorkMinutes * 60 : timer.pomodoroBreakMinutes * 60;
    if (totalSec === 0) return 0;
    return 1 - remainSec / totalSec;
  }, [
    timer.displayTime,
    timer.isRunning,
    isWork,
    timer.pomodoroWorkMinutes,
    timer.pomodoroBreakMinutes,
  ]);

  const ringSize = 120;
  const strokeWidth = 4;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div>
      {/* Ring + Time */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
        <div style={{ position: 'relative', width: ringSize, height: ringSize }}>
          {/* SVG ring */}
          <svg
            width={ringSize}
            height={ringSize}
            style={{
              transform: 'rotate(-90deg)',
              ...(timer.isRunning ? { animation: 'twRingPulse 3s ease-in-out infinite' } : {}),
            }}
          >
            {/* Track */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={strokeWidth}
            />
            {/* Progress */}
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke={accent}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: `stroke-dashoffset 0.5s ${EASING}, stroke 0.3s ${EASING}` }}
            />
          </svg>

          {/* Center content */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Phase badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '2px 8px',
                borderRadius: 20,
                background: accentGlow,
                marginBottom: 2,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11, color: accent }}>
                {isWork ? 'edit' : 'coffee'}
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: accent,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {isWork ? 'Focus' : 'Break'}
              </span>
            </div>
            {/* Time */}
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                fontFamily: 'var(--font-display), monospace',
                color: timer.isRunning ? accent : C.textPrimary,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                transition: `color 0.3s ${EASING}`,
              }}
            >
              {timer.displayTime}
            </div>
            {/* Session */}
            <div
              style={{
                fontSize: 10,
                color: C.textMuted,
                fontWeight: 500,
                marginTop: 1,
              }}
            >
              Session {timer.pomodoroSessionCount + 1}
            </div>
          </div>
        </div>
      </div>

      {/* Inputs */}
      {!timer.isRunning && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <NumberInput
            label="Work (min)"
            value={timer.pomodoroWorkMinutes}
            onChange={timer.setPomodoroWorkMinutes}
            min={1}
            max={120}
          />
          <NumberInput
            label="Break (min)"
            value={timer.pomodoroBreakMinutes}
            onChange={timer.setPomodoroBreakMinutes}
            min={1}
            max={60}
          />
        </div>
      )}

      <ActionButtons
        isRunning={timer.isRunning}
        onStart={timer.start}
        onPause={timer.pause}
        onReset={timer.reset}
        accent={accent}
        hoveredBtn={hoveredBtn}
        setHoveredBtn={setHoveredBtn}
      />
    </div>
  );
}

function StopwatchPanel({
  timer,
  hoveredBtn,
  setHoveredBtn,
}: {
  timer: ReturnType<typeof useTimer>;
  hoveredBtn: string | null;
  setHoveredBtn: (v: string | null) => void;
}) {
  return (
    <div>
      <TimeDisplay
        time={timer.displayTime}
        isRunning={timer.isRunning}
        color={timer.isRunning ? C.primary : C.textPrimary}
        size={42}
        padTop={20}
        padBottom={22}
      />
      <ActionButtons
        isRunning={timer.isRunning}
        onStart={timer.start}
        onPause={timer.pause}
        onReset={timer.reset}
        startLabel="Start"
        accent={C.primary}
        hoveredBtn={hoveredBtn}
        setHoveredBtn={setHoveredBtn}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

function TimeDisplay({
  time,
  isRunning,
  color,
  size = 38,
  padTop = 10,
  padBottom = 16,
}: {
  time: string;
  isRunning: boolean;
  color: string;
  size?: number;
  padTop?: number;
  padBottom?: number;
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        fontSize: size,
        fontWeight: 700,
        fontFamily: 'var(--font-display), monospace',
        color,
        letterSpacing: '-0.02em',
        lineHeight: 1,
        padding: `${padTop}px 0 ${padBottom}px`,
        transition: `color 0.3s ${EASING}`,
        textShadow: isRunning ? `0 0 20px ${color}44` : 'none',
      }}
    >
      {time}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div style={{ flex: 1 }}>
      <label
        style={{
          display: 'block',
          fontSize: 9,
          fontWeight: 700,
          color: C.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 5,
        }}
      >
        {label}
      </label>
      <input
        type="number"
        className="tw-num"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '9px 10px',
          borderRadius: 10,
          border: `1.5px solid ${focused ? C.primary : 'rgba(85,85,120,0.4)'}`,
          background: focused ? 'rgba(174,137,255,0.06)' : C.inputBg,
          color: C.textPrimary,
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'var(--font-display), monospace',
          textAlign: 'center',
          outline: 'none',
          boxSizing: 'border-box',
          transition: `border-color 0.2s ${EASING}, background 0.2s ${EASING}`,
          boxShadow: focused ? `0 0 0 3px ${C.primary}18` : 'none',
        }}
      />
    </div>
  );
}

function ActionButtons({
  isRunning,
  onStart,
  onPause,
  onReset,
  startLabel,
  accent,
  hoveredBtn,
  setHoveredBtn,
}: {
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  startLabel?: string;
  accent: string;
  hoveredBtn: string | null;
  setHoveredBtn: (v: string | null) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {isRunning ? (
        <ActionBtn
          label="Pause"
          icon="pause"
          variant="secondary"
          accent={accent}
          onClick={onPause}
          hovered={hoveredBtn === 'pause'}
          onHover={(h) => setHoveredBtn(h ? 'pause' : null)}
        />
      ) : (
        <ActionBtn
          label={startLabel || 'Start'}
          icon="play_arrow"
          variant="primary"
          accent={accent}
          onClick={onStart}
          hovered={hoveredBtn === 'start'}
          onHover={(h) => setHoveredBtn(h ? 'start' : null)}
        />
      )}
      <ActionBtn
        label="Reset"
        icon="restart_alt"
        variant="ghost"
        accent={accent}
        onClick={onReset}
        hovered={hoveredBtn === 'reset'}
        onHover={(h) => setHoveredBtn(h ? 'reset' : null)}
      />
    </div>
  );
}

function ActionBtn({
  label,
  icon,
  variant,
  accent,
  onClick,
  hovered,
  onHover,
}: {
  label: string;
  icon: string;
  variant: 'primary' | 'secondary' | 'ghost';
  accent: string;
  onClick: () => void;
  hovered: boolean;
  onHover: (h: boolean) => void;
}) {
  const base = {
    primary: {
      background: accent,
      color: C.pageBg,
      flex: 1 as const,
      boxShadow: hovered ? `0 4px 16px ${accent}44` : `0 2px 8px ${accent}22`,
      transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
    },
    secondary: {
      background: hovered ? 'rgba(255,255,255,0.08)' : C.elevated,
      color: C.textPrimary,
      flex: 1 as const,
      boxShadow: 'none',
      transform: 'translateY(0)',
    },
    ghost: {
      background: hovered ? 'rgba(255,255,255,0.05)' : 'transparent',
      color: hovered ? C.textSecondary : C.textMuted,
      flex: 0 as const,
      boxShadow: 'none',
      transform: 'translateY(0)',
    },
  }[variant];

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        height: 38,
        padding: variant === 'ghost' ? '0 14px' : undefined,
        borderRadius: 10,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        fontSize: 13,
        fontWeight: 600,
        transition: `background 0.15s ${EASING}, color 0.15s ${EASING}, box-shadow 0.2s ${EASING}, transform 0.2s ${EASING}`,
        ...base,
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
        {icon}
      </span>
      {label}
    </button>
  );
}
