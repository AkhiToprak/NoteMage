'use client';

// Phase 9.3 — /learn/chats index. The rail lives in chats/layout.tsx; this
// page only renders the right-pane empty state.

export default function LearnChatsIndexPage() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        background: 'var(--background)',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          textAlign: 'center',
          padding: '32px',
          background: 'var(--surface-container)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{
            fontSize: '44px',
            color: 'var(--on-surface-variant)',
          }}
        >
          forum
        </span>
        <h2
          style={{
            margin: '12px 0 6px',
            fontFamily: 'var(--font-display)',
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.02em',
          }}
        >
          Pick a chat from the rail
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.6,
          }}
        >
          Open one of your existing chats on the left, or start a new one to draw context from any
          of your notebooks.
        </p>
      </div>
    </div>
  );
}
