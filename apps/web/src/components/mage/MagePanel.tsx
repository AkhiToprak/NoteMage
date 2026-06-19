'use client';

/* Hallmark · component: side-panel + chat · genre: editorial · theme: project (Neon Scholar)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (uses --surface-* / --on-surface / --primary / --on-primary tokens)
 *
 * Mage Revolution Phase 1 — the global Mage panel. Desktop: a right-anchored
 * overlay (clamp 360–420px). Mobile: a full-bleed drawer with a scrim. Streams
 * a plain answer from POST /api/mage/messages (no citations / actions / gate
 * yet — those land in later phases). Motion is transform/opacity only with the
 * project spring easing, and collapses under prefers-reduced-motion.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { Mascot } from '@/components/mascot';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { useMage } from './MageProvider';

interface PanelMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const EXAMPLE_PROMPTS = [
  'Explain this simply',
  'Quiz me on what I’m studying',
  'What should I focus on next?',
];

let idCounter = 0;
const nextId = () => `mage-${++idCounter}`;

export function MagePanel() {
  const { isOpen, close, context } = useMage();
  const { isPhone } = useBreakpoint();

  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [input, setInput] = useState('');
  const chatIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const handleResponse = useCallback((res: Response) => {
    const id = res.headers.get('X-Mage-Chat-Id');
    if (id) chatIdRef.current = id;
  }, []);

  const { streamingText, status, error, send, abort } = useStreamingChat({
    endpoint: '/api/mage/messages',
    onResponse: handleResponse,
  });
  const isStreaming = status === 'streaming';

  // Focus the composer when the panel opens.
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  // Keep the transcript pinned to the latest content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingText, isOpen]);

  // Esc closes the panel.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  const handleSend = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || isStreaming) return;
      setInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      setMessages((m) => [...m, { id: nextId(), role: 'user', content: text }]);
      const done = await send(text, {
        chatId: chatIdRef.current ?? undefined,
        context,
      });
      if (done?.assistantMessage) {
        setMessages((m) => [
          ...m,
          {
            id: done.assistantMessage.id || nextId(),
            role: 'assistant',
            content: done.assistantMessage.content,
          },
        ]);
      } else if (done?.aborted && done.partialText) {
        setMessages((m) => [...m, { id: nextId(), role: 'assistant', content: done.partialText! }]);
      }
    },
    [isStreaming, send, context]
  );

  const showEmptyState = messages.length === 0 && !isStreaming && !streamingText;

  const panelWidth = isPhone ? '100vw' : 'clamp(360px, 30vw, 420px)';

  return (
    <>
      {/* Scrim — mobile only; click to dismiss. */}
      <div
        className="mage-scrim"
        data-open={isOpen && isPhone ? 'true' : 'false'}
        aria-hidden="true"
        onClick={close}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1190,
          background: 'rgba(8, 6, 24, 0.55)',
          opacity: isOpen && isPhone ? 1 : 0,
          pointerEvents: isOpen && isPhone ? 'auto' : 'none',
        }}
      />

      <aside
        className="mage-panel"
        role="dialog"
        aria-modal={isPhone ? true : undefined}
        aria-label="Mage study companion"
        aria-hidden={isOpen ? undefined : true}
        inert={isOpen ? undefined : true}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth,
          zIndex: 1200,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface-container-low)',
          borderLeft: isPhone ? 'none' : '1px solid var(--outline-variant)',
          boxShadow: '-8px 0 32px rgba(174, 137, 255, 0.06), -2px 0 8px rgba(0, 0, 0, 0.3)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderBottom: '1px solid var(--outline-variant)',
            flexShrink: 0,
            background: 'var(--surface-container)',
          }}
        >
          <Mascot pose="chatting" size={36} idle="none" />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Mage
            </span>
            <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>
              Your study companion
            </span>
          </div>
          <button
            type="button"
            className="mage-icon-btn"
            onClick={close}
            aria-label="Close Mage"
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
              close
            </span>
          </button>
        </header>

        {/* Transcript */}
        <div
          ref={scrollRef}
          className="mage-scroll custom-scrollbar"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '16px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {showEmptyState ? (
            <div
              style={{
                margin: 'auto 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '14px',
                padding: '8px 4px',
              }}
            >
              <Mascot pose="holding-wand" size={96} idle="float" />
              <p
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  margin: 0,
                }}
              >
                Ask Mage anything
              </p>
              <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: 0, maxWidth: '260px' }}>
                Get explanations, quiz yourself, or plan what to study next.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '4px' }}>
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="mage-chip"
                    onClick={() => handleSend(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((m) => (
                <MessageBubble key={m.id} role={m.role} content={m.content} />
              ))}
              {isStreaming && (
                <MessageBubble role="assistant" content={streamingText} streaming />
              )}
            </>
          )}
        </div>

        {/* Error row */}
        {error && (
          <div
            role="alert"
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              fontSize: '12px',
              color: 'var(--error)',
              borderTop: '1px solid var(--outline-variant)',
            }}
          >
            {error}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            padding: '10px 12px',
            paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--outline-variant)',
            background: 'var(--surface-container)',
          }}
        >
          <textarea
            ref={inputRef}
            className="mage-input"
            value={input}
            rows={1}
            placeholder="Message Mage…"
            disabled={isStreaming}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(input);
              }
            }}
            style={{
              flex: 1,
              resize: 'none',
              maxHeight: '140px',
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              fontSize: '14px',
              lineHeight: 1.4,
              outline: 'none',
            }}
          />
          {isStreaming ? (
            <button
              type="button"
              className="mage-send"
              onClick={abort}
              aria-label="Stop generating"
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
                stop
              </span>
            </button>
          ) : (
            <button
              type="submit"
              className="mage-send"
              disabled={input.trim().length === 0}
              aria-label="Send message"
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
                arrow_upward
              </span>
            </button>
          )}
        </form>
      </aside>

      <style>{`
        .mage-panel {
          transition:
            transform 0.32s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-scrim {
          transition: opacity 0.32s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: var(--radius-full);
          border: none;
          background: transparent;
          color: var(--on-surface-variant);
          cursor: pointer;
          flex-shrink: 0;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-icon-btn:hover { background: var(--surface-bright); color: var(--on-surface); }
        .mage-icon-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-icon-btn:active { transform: scale(0.92); }

        .mage-chip {
          text-align: left;
          padding: 10px 14px;
          border-radius: var(--radius-md);
          border: 1px solid var(--outline-variant);
          background: var(--surface-container-high);
          color: var(--on-surface);
          font-family: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-chip:hover { background: var(--surface-bright); }
        .mage-chip:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-chip:active { transform: translateY(1px); }

        .mage-input:focus-visible { border-color: var(--primary); }
        .mage-input::placeholder { color: var(--on-surface-variant); }
        .mage-input:disabled { opacity: 0.6; cursor: not-allowed; }

        .mage-send {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border-radius: var(--radius-full);
          border: none;
          background: var(--primary);
          color: var(--on-primary);
          cursor: pointer;
          transition:
            background 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.14s cubic-bezier(0.22, 1, 0.36, 1),
            opacity 0.14s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-send:hover { background: var(--primary-dim); }
        .mage-send:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
        .mage-send:active { transform: scale(0.92); }
        .mage-send:disabled { opacity: 0.4; cursor: not-allowed; }

        .mage-caret {
          color: var(--primary);
          margin-left: 1px;
          animation: mage-blink 1s step-end infinite;
        }
        @keyframes mage-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

        @media (prefers-reduced-motion: reduce) {
          .mage-panel, .mage-scrim { transition: opacity 0.12s linear; }
          .mage-icon-btn, .mage-chip, .mage-send { transition: none; }
          .mage-icon-btn:active, .mage-chip:active, .mage-send:active { transform: none; }
          .mage-caret { animation: none; }
        }
      `}</style>
    </>
  );
}

function MessageBubble({
  role,
  content,
  streaming = false,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '88%',
          padding: isUser ? '9px 13px' : '10px 13px',
          borderRadius: 'var(--radius-lg)',
          background: isUser ? 'var(--primary)' : 'var(--surface-container-high)',
          color: isUser ? 'var(--on-primary)' : 'var(--on-surface)',
          border: isUser ? 'none' : '1px solid var(--outline-variant)',
          fontSize: '14px',
          lineHeight: 1.55,
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}
      >
        {isUser ? (
          content
        ) : content ? (
          <MarkdownRenderer content={content} variant="plain" />
        ) : (
          <TypingDots />
        )}
        {streaming && content && (
          <span aria-hidden="true" className="mage-caret">
            ▍
          </span>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span
      aria-label="Mage is thinking"
      role="status"
      style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', height: '18px' }}
    >
      <span className="mage-dot" />
      <span className="mage-dot" />
      <span className="mage-dot" />
      <style>{`
        .mage-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--on-surface-variant);
          opacity: 0.4;
          animation: mage-dot-pulse 1.2s ease-in-out infinite;
        }
        .mage-dot:nth-child(2) { animation-delay: 0.2s; }
        .mage-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes mage-dot-pulse {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mage-dot { animation: none; opacity: 0.6; }
        }
      `}</style>
    </span>
  );
}

export default MagePanel;
