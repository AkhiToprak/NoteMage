'use client';

/**
 * Global "AI is working" indicator for the notebook workspace.
 *
 * Any AI action inside a text file editor (or elsewhere in the notebook
 * workspace) can surface its busy state globally by calling
 * `startAiTask(label)` when it begins and `finishAiTask(id)` when it ends.
 *
 * A floating pill at the bottom-right of the viewport renders one row per
 * in-flight task so that progress stays visible regardless of scroll
 * position, workspace tab, or focus. The pill sits above the CoWork chat
 * toggle (which occupies bottom-right at z 1000 / 48×48) by using
 * bottom: 88px.
 *
 * State/actions are split into two contexts so that action consumers
 * (GenerateDropdown, InlineAIToolbar, …) do not re-render when the task
 * list changes — only the indicator subscribes to the state context.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface AiTask {
  id: string;
  label: string;
  startedAt: number;
}

interface AiTaskActions {
  startAiTask: (label: string) => string;
  finishAiTask: (id: string) => void;
}

const AiTaskStateContext = createContext<AiTask[] | null>(null);
const AiTaskActionsContext = createContext<AiTaskActions | null>(null);

// Safety-net sweeper: forgotten `finishAiTask` calls would otherwise leave
// a ghost pill on screen forever. Drop anything older than 2 minutes.
const MAX_TASK_AGE_MS = 120_000;
const SWEEP_INTERVAL_MS = 15_000;

function generateTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* fall through to fallback */
    }
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AiTaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<AiTask[]>([]);

  const startAiTask = useCallback((label: string): string => {
    const id = generateTaskId();
    setTasks((prev) => [...prev, { id, label, startedAt: Date.now() }]);
    return id;
  }, []);

  const finishAiTask = useCallback((id: string): void => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Ghost-task sweeper. Uses functional setTasks so we never close over
  // stale state. No-op if nothing is stale.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setTasks((prev) => {
        const cutoff = Date.now() - MAX_TASK_AGE_MS;
        if (prev.every((t) => t.startedAt >= cutoff)) return prev;
        return prev.filter((t) => t.startedAt >= cutoff);
      });
    }, SWEEP_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  // Stable actions identity: both callbacks are useCallback([], …), so this
  // memo is effectively constant across the provider's lifetime. Consumers
  // of `useAiTask()` therefore never re-render when tasks change.
  const actions = useMemo<AiTaskActions>(
    () => ({ startAiTask, finishAiTask }),
    [startAiTask, finishAiTask]
  );

  return (
    <AiTaskActionsContext.Provider value={actions}>
      <AiTaskStateContext.Provider value={tasks}>
        {children}
        <AiStatusIndicator />
      </AiTaskStateContext.Provider>
    </AiTaskActionsContext.Provider>
  );
}

/**
 * Read-only access to the action API. Safe to call from any component
 * inside <AiTaskProvider>. The returned object is stable, so destructuring
 * and using the functions directly will not cause extra re-renders.
 */
export function useAiTask(): AiTaskActions {
  const ctx = useContext(AiTaskActionsContext);
  if (!ctx) {
    throw new Error('useAiTask must be used inside <AiTaskProvider>');
  }
  return ctx;
}

function useAiTasks(): AiTask[] {
  const ctx = useContext(AiTaskStateContext);
  if (!ctx) {
    throw new Error('useAiTasks must be used inside <AiTaskProvider>');
  }
  return ctx;
}

/* ────────────────────────────────────────────────────────────────────────
 * Indicator UI
 * ──────────────────────────────────────────────────────────────────────── */

function AiStatusIndicator() {
  const tasks = useAiTasks();

  // Skip the fixed-position wrapper entirely when nothing is running so
  // the DOM stays clean and the wrapper can't accidentally swallow clicks.
  if (tasks.length === 0) return null;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        aria-label={`${tasks.length} AI task${tasks.length === 1 ? '' : 's'} running`}
        style={{
          position: 'fixed',
          right: 24,
          // 24 + CoWorkChat toggle (48) + 16 gap = 88. env() respects the
          // iOS home indicator on mobile.
          bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
          zIndex: 900,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {tasks.map((task) => (
          <AiTaskPill key={task.id} label={task.label} />
        ))}
      </div>
      <style>{`
        @keyframes ai-status-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ai-status-pulse {
          0%, 100% {
            box-shadow:
              0 8px 32px rgba(174, 137, 255, 0.15),
              0 2px 8px rgba(0, 0, 0, 0.4);
          }
          50% {
            box-shadow:
              0 10px 36px rgba(174, 137, 255, 0.26),
              0 2px 12px rgba(0, 0, 0, 0.5);
          }
        }
      `}</style>
    </>
  );
}

function AiTaskPill({ label }: { label: string }) {
  // Defer the "mounted" state by one frame so CSS transitions apply to the
  // entrance. Without this the element would paint in its final state and
  // the enter animation would be skipped.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px 10px 14px',
        background: 'rgba(35, 35, 66, 0.92)',
        border: '1px solid rgba(140, 82, 255, 0.28)',
        borderRadius: 9999,
        color: '#eeecff',
        fontSize: 13,
        fontWeight: 500,
        fontFamily: 'var(--font-sans, inherit)',
        letterSpacing: '0.01em',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow:
          '0 8px 32px rgba(174, 137, 255, 0.15), 0 2px 8px rgba(0, 0, 0, 0.4)',
        opacity: mounted ? 1 : 0,
        transform: mounted
          ? 'translateY(0) scale(1)'
          : 'translateY(12px) scale(0.96)',
        transition:
          'opacity 350ms cubic-bezier(0.22, 1, 0.36, 1), transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
        animation: 'ai-status-pulse 2.4s ease-in-out infinite',
        // Re-enable pointer events on the pill itself so hover/tooltip
        // work even though the wrapper is pointer-events: none.
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{
          fontSize: 18,
          color: '#c4a9ff',
          animation: 'ai-status-spin 1s linear infinite',
          display: 'inline-block',
          lineHeight: 1,
        }}
      >
        progress_activity
      </span>
      <span>{label}</span>
    </div>
  );
}
