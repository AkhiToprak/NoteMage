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
          Start a new chat, or pick an existing one!
        </h2>
      </div>
    </div>
  );
}
