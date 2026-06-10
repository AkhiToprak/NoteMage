'use client';

import { use } from 'react';
import ChatThread from '@/components/learn/ChatThread';

// Phase 9.3 — /learn/chats/[chatId]. Just unwraps the chatId param and
// hands off to the shared ChatThread component (built by Agent B).

export default function LearnChatDetailPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = use(params);
  return <ChatThread chatId={chatId} />;
}
