import React from 'react';

// /learn layout — flex-column wrapper for the Learn surfaces. The old
// horizontal tab strip (Overview / Paths / Flashcards / Quizzes / Chats /
// Community) was removed; navigation between Learn surfaces now lives in the
// global header + burger nav.

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}
