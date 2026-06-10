'use client';

import { use } from 'react';
import ChatThread from '@/components/learn/ChatThread';

// Renders the mage chat inside the notebook workspace (sidebar + content).
// Reads the same NotebookChat record as /learn/chats/[chatId] — both routes
// are views onto one conversation, so a chat can be continued from the
// notebook or from the learn hub. ChatThread is self-contained (takes only a
// chatId) and sizes itself to its flex parent, so it drops straight into the
// notebook content slot.

export default function NotebookChatDetailPage({
  params,
}: {
  params: Promise<{ id: string; chatId: string }>;
}) {
  const { chatId } = use(params);
  return <ChatThread chatId={chatId} />;
}
