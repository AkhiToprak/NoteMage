'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   TimerContext — Global timer state shared across all dashboard pages
   ═══════════════════════════════════════════════════════════════════════════ */

type TimerMode = 'countdown' | 'pomodoro' | 'stopwatch';
type PomodoroPhase = 'work' | 'break';

interface TimerContextValue {
  mode: TimerMode;
  setMode: (m: TimerMode) => void;

  isRunning: boolean;
  displayTime: string;

  // Countdown config
  countdownHours: number;
  setCountdownHours: (h: number) => void;
  countdownMinutes: number;
  setCountdownMinutes: (m: number) => void;

  // Pomodoro config
  pomodoroWorkMinutes: number;
  setPomodoroWorkMinutes: (m: number) => void;
  pomodoroBreakMinutes: number;
  setPomodoroBreakMinutes: (m: number) => void;
  pomodoroPhase: PomodoroPhase;
  pomodoroSessionCount: number;

  // Controls
  start: () => void;
  pause: () => void;
  reset: () => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export function useTimer() {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within <TimerProvider>');
  return ctx;
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<TimerMode>('countdown');
  const [isRunning, setIsRunning] = useState(false);
  const [displayTime, setDisplayTime] = useState('00:00');

  // Countdown
  const [countdownHours, setCountdownHours] = useState(0);
  const [countdownMinutes, setCountdownMinutes] = useState(5);

  // Pomodoro
  const [pomodoroWorkMinutes, setPomodoroWorkMinutes] = useState(25);
  const [pomodoroBreakMinutes, setPomodoroBreakMinutes] = useState(5);
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('work');
  const [pomodoroSessionCount, setPomodoroSessionCount] = useState(0);

  // Internal refs for timestamp-based accuracy
  const targetEndRef = useRef<number | null>(null); // countdown & pomodoro
  const startedAtRef = useRef<number | null>(null); // stopwatch
  const accumulatedRef = useRef(0); // stopwatch accumulated ms before pause
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Pre-load audio
  useEffect(() => {
    audioRef.current = new Audio('/sounds/timer-done.wav');
    audioRef.current.preload = 'auto';
    audioRef.current.volume = 0.7;
  }, []);

  const playSound = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Tick logic ──────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    if (mode === 'stopwatch') {
      if (!startedAtRef.current) return;
      const elapsed = accumulatedRef.current + (Date.now() - startedAtRef.current);
      setDisplayTime(formatTime(elapsed / 1000));
      return;
    }

    // countdown & pomodoro
    if (!targetEndRef.current) return;
    const remaining = (targetEndRef.current - Date.now()) / 1000;

    if (remaining <= 0) {
      setDisplayTime('00:00');
      playSound();

      if (mode === 'countdown') {
        setIsRunning(false);
        stopInterval();
        targetEndRef.current = null;
        return;
      }

      // Pomodoro: auto-transition
      if (mode === 'pomodoro') {
        setPomodoroPhase((prev) => {
          const next = prev === 'work' ? 'break' : 'work';
          const nextDuration =
            next === 'work' ? pomodoroWorkMinutes * 60 * 1000 : pomodoroBreakMinutes * 60 * 1000;
          targetEndRef.current = Date.now() + nextDuration;
          if (next === 'work') {
            setPomodoroSessionCount((c) => c + 1);
          }
          return next;
        });
        return;
      }
    }

    setDisplayTime(formatTime(remaining));
  }, [mode, pomodoroWorkMinutes, pomodoroBreakMinutes, playSound, stopInterval]);

  // Manage interval
  useEffect(() => {
    if (isRunning) {
      tick(); // immediate first tick
      intervalRef.current = setInterval(tick, 250); // 250ms for smoother updates
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [isRunning, tick, stopInterval]);

  // ── Controls ────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (mode === 'countdown') {
      const totalMs = (countdownHours * 3600 + countdownMinutes * 60) * 1000;
      if (totalMs <= 0) return;
      if (targetEndRef.current && !isRunning) {
        // Resuming — recalculate end from remaining
        const remainStr = displayTime.split(':').map(Number);
        let remainSec = 0;
        if (remainStr.length === 3) remainSec = remainStr[0] * 3600 + remainStr[1] * 60 + remainStr[2];
        else remainSec = remainStr[0] * 60 + remainStr[1];
        if (remainSec <= 0) {
          targetEndRef.current = Date.now() + totalMs;
        } else {
          targetEndRef.current = Date.now() + remainSec * 1000;
        }
      } else {
        targetEndRef.current = Date.now() + totalMs;
      }
    }

    if (mode === 'pomodoro') {
      const totalMs =
        pomodoroPhase === 'work'
          ? pomodoroWorkMinutes * 60 * 1000
          : pomodoroBreakMinutes * 60 * 1000;
      if (targetEndRef.current && !isRunning) {
        const remainStr = displayTime.split(':').map(Number);
        let remainSec = 0;
        if (remainStr.length === 3) remainSec = remainStr[0] * 3600 + remainStr[1] * 60 + remainStr[2];
        else remainSec = remainStr[0] * 60 + remainStr[1];
        if (remainSec <= 0) {
          targetEndRef.current = Date.now() + totalMs;
        } else {
          targetEndRef.current = Date.now() + remainSec * 1000;
        }
      } else {
        targetEndRef.current = Date.now() + totalMs;
      }
    }

    if (mode === 'stopwatch') {
      startedAtRef.current = Date.now();
    }

    setIsRunning(true);
  }, [mode, countdownHours, countdownMinutes, pomodoroWorkMinutes, pomodoroBreakMinutes, pomodoroPhase, isRunning, displayTime]);

  const pause = useCallback(() => {
    if (mode === 'stopwatch' && startedAtRef.current) {
      accumulatedRef.current += Date.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
    setIsRunning(false);
  }, [mode]);

  const reset = useCallback(() => {
    setIsRunning(false);
    stopInterval();
    targetEndRef.current = null;
    startedAtRef.current = null;
    accumulatedRef.current = 0;

    if (mode === 'countdown') {
      setDisplayTime(formatTime(countdownHours * 3600 + countdownMinutes * 60));
    } else if (mode === 'pomodoro') {
      setPomodoroPhase('work');
      setPomodoroSessionCount(0);
      setDisplayTime(formatTime(pomodoroWorkMinutes * 60));
    } else {
      setDisplayTime('00:00');
    }
  }, [mode, countdownHours, countdownMinutes, pomodoroWorkMinutes, stopInterval]);

  // Update display when mode or config changes (only when not running)
  useEffect(() => {
    if (isRunning) return;
    if (mode === 'countdown') {
      setDisplayTime(formatTime(countdownHours * 3600 + countdownMinutes * 60));
    } else if (mode === 'pomodoro') {
      setDisplayTime(formatTime(pomodoroWorkMinutes * 60));
    } else {
      if (!startedAtRef.current && accumulatedRef.current === 0) {
        setDisplayTime('00:00');
      }
    }
  }, [mode, countdownHours, countdownMinutes, pomodoroWorkMinutes, isRunning]);

  return (
    <TimerContext.Provider
      value={{
        mode,
        setMode,
        isRunning,
        displayTime,
        countdownHours,
        setCountdownHours,
        countdownMinutes,
        setCountdownMinutes,
        pomodoroWorkMinutes,
        setPomodoroWorkMinutes,
        pomodoroBreakMinutes,
        setPomodoroBreakMinutes,
        pomodoroPhase,
        pomodoroSessionCount,
        start,
        pause,
        reset,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}
