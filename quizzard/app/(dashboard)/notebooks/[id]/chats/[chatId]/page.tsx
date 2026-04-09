'use client';

import { useState, useEffect, use, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { getMageName } from '@/lib/scholar';
import Link from 'next/link';
import {
  X,
  Upload,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Layers,
  HelpCircle,
  Presentation,
  Youtube,
  Square,
} from 'lucide-react';
import { useNotebookWorkspace } from '@/components/notebook/NotebookWorkspaceContext';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import dynamic from 'next/dynamic';

const MindmapRenderer = dynamic(() => import('@/components/notebook/MindmapRenderer'), {
  ssr: false,
});
const SlideEditorModal = dynamic(() => import('@/components/notebook/SlideEditorModal'), {
  ssr: false,
});

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  tokens?: number | null;
  createdAt: string;
}

interface ChatData {
  id: string;
  title: string;
  contextPageIds: string[];
  contextDocIds: string[];
  createdAt: string;
  messages: ChatMessage[];
}

interface DocumentItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface SectionRef {
  id: string;
  title: string;
  pages: { id: string; title: string }[];
  children?: SectionRef[];
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
  const { id: notebookId, chatId } = use(params);
  const { notebook, flatSections, refreshChats } = useNotebookWorkspace();
  const { upload: directUpload } = useDirectUpload();
  const { isPhone } = useBreakpoint();
  const { data: session } = useSession();
  const mageName = getMageName(session?.user?.scholarName);

  const [chat, setChat] = useState<ChatData | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [showFeedPanel, setShowFeedPanel] = useState(false);
  const [feedTab, setFeedTab] = useState<'notebook' | 'upload'>('notebook');
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSavingContext, setIsSavingContext] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [contextWarning, setContextWarning] = useState<string | null>(null);

  const {
    streamingText,
    status: streamStatus,
    send: streamSend,
    abort: streamAbort,
    error: streamError,
  } = useStreamingChat({ notebookId, chatId });
  const isSending = streamStatus === 'streaming';
  const displayError = sendError || streamError;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchChat = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/chats/${chatId}`);
    const json = await res.json();
    if (json.success && json.data) {
      const data = json.data as ChatData;
      setChat(data);
      setSelectedPageIds(new Set(data.contextPageIds));
      setSelectedDocIds(new Set(data.contextDocIds));
    }
  }, [notebookId, chatId]);

  const fetchDocs = useCallback(async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/documents`);
    const json = await res.json();
    if (json.success) setDocuments(json.data ?? []);
  }, [notebookId]);

  useEffect(() => {
    fetchChat();
    fetchDocs();
  }, [fetchChat, fetchDocs]);

  // Auto-scroll to bottom when messages change or streaming text updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages, streamingText]);

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text || isSending) return;

    setSendError(null);

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setChat((prev) => (prev ? { ...prev, messages: [...prev.messages, tempUserMsg] } : prev));
    setInputValue('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const donePayload = await streamSend(text);

      if (donePayload) {
        if (donePayload.aborted) {
          // User stopped generation — show what we have
          const partialText = donePayload.partialText || '';
          const stoppedContent = partialText || '*Generation stopped*';

          setChat((prev) => {
            if (!prev) return prev;
            const filtered = prev.messages.filter((m) => m.id !== tempUserMsg.id);
            return {
              ...prev,
              messages: [
                ...filtered,
                {
                  id: `user-${Date.now()}`,
                  role: 'user',
                  content: text,
                  createdAt: new Date().toISOString(),
                },
                {
                  id: `stopped-${Date.now()}`,
                  role: 'assistant',
                  content: stoppedContent,
                  createdAt: new Date().toISOString(),
                },
              ],
            };
          });
        } else {
          const { userMessage, assistantMessage, flashcardSet, quizSet, contextStatus } =
            donePayload;

          // Replace temp message with real ones
          setChat((prev) => {
            if (!prev) return prev;
            const filtered = prev.messages.filter((m) => m.id !== tempUserMsg.id);
            return {
              ...prev,
              messages: [...filtered, userMessage, assistantMessage],
            };
          });

          // Show warning if some context sources couldn't be read
          if (
            contextStatus &&
            Array.isArray(contextStatus.skipped) &&
            contextStatus.skipped.length > 0
          ) {
            const names = contextStatus.skipped.map((s: { name: string }) => s.name).join(', ');
            setContextWarning(
              `${contextStatus.skipped.length} Quelle(n) konnten nicht gelesen werden: ${names}`
            );
            setTimeout(() => setContextWarning(null), 10_000);
          } else {
            setContextWarning(null);
          }

          // Refresh sidebar chats if flashcards or quizzes were created
          if (flashcardSet || quizSet) {
            refreshChats();
          }
        }
      } else {
        // Null = error (already set by hook)
        setChat((prev) =>
          prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempUserMsg.id) } : prev
        );
      }
    } catch {
      setChat((prev) =>
        prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempUserMsg.id) } : prev
      );
      setSendError('Network error. Please try again.');
    } finally {
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const uploadFile = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError('Unsupported file type. Allowed: PDF, DOCX, TXT, MD');
      return;
    }
    setUploadError(null);
    setIsUploading(true);
    try {
      const { storagePath } = await directUpload(file, 'document', { notebookId });
      const res = await fetch(`/api/notebooks/${notebookId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, fileName: file.name, fileType: file.type }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        await fetchDocs();
        const newDocIds = new Set([...selectedDocIds, json.data.id]);
        setSelectedDocIds(newDocIds);

        // Auto-save: immediately add the uploaded document to the chat's context
        // so the AI can reference it without requiring a manual "Update Context" click
        await fetch(`/api/notebooks/${notebookId}/chats/${chatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextDocIds: [...newDocIds] }),
        });
        // Update local chat state to reflect the new context
        setChat((prev) => (prev ? { ...prev, contextDocIds: [...newDocIds] } : prev));
      } else {
        setUploadError(json.error ?? 'Upload failed. Please try again.');
      }
    } catch {
      setUploadError('Network error. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveContext = async () => {
    if (!chat) return;
    setIsSavingContext(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contextPageIds: [...selectedPageIds],
          contextDocIds: [...selectedDocIds],
        }),
      });
      await fetchChat();
      setShowFeedPanel(false);
    } finally {
      setIsSavingContext(false);
    }
  };

  // Build section tree
  const sectionTree: SectionRef[] = flatSections
    .filter((s) => !s.parentId)
    .map((s) => ({
      id: s.id,
      title: s.title,
      pages: s.pages,
      children: flatSections
        .filter((c) => c.parentId === s.id)
        .map((c) => ({ id: c.id, title: c.title, pages: c.pages })),
    }));

  const totalContext = selectedPageIds.size + selectedDocIds.size;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: 'var(--font-chat)',
        position: 'relative',
      }}
    >
      {/* Chat header */}
      <div
        style={{
          padding: isPhone ? '12px 14px' : '18px 28px',
          borderBottom: '1px solid rgba(140,82,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isPhone ? '8px' : '16px',
          background: 'rgba(17,17,38,0.6)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(140,82,255,0.4), rgba(81,112,255,0.3))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '15px', color: '#c4a9ff', fontVariationSettings: "'FILL' 1" }}
            >
              auto_fix_high
            </span>
          </div>
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                margin: 0,
                fontSize: '15px',
                fontWeight: 700,
                color: '#ede9ff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {chat?.title ?? '…'}
            </h1>
            {totalContext > 0 && (
              <p style={{ margin: 0, fontSize: '11px', color: 'rgba(185,195,255,0.55)' }}>
                {totalContext} context source{totalContext !== 1 ? 's' : ''} attached
              </p>
            )}
          </div>
        </div>

        {/* Feed the Mage button */}
        <button
          onClick={() => setShowFeedPanel(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isPhone ? '9px 12px' : '9px 18px',
            borderRadius: '10px',
            border: '1px solid rgba(140,82,255,0.3)',
            background: 'rgba(140,82,255,0.1)',
            color: '#c4a9ff',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            flexShrink: 0,
            fontFamily: 'var(--font-chat)',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.2)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(140,82,255,0.5)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.1)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(140,82,255,0.3)';
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '15px', fontVariationSettings: "'FILL' 1" }}
          >
            cloud_upload
          </span>
          {!isPhone && `Feed ${mageName}`}
          {totalContext > 0 && (
            <span
              style={{
                background: 'rgba(140,82,255,0.35)',
                color: '#e0d0ff',
                borderRadius: '9999px',
                padding: '1px 7px',
                fontSize: '10px',
                fontWeight: 800,
              }}
            >
              {totalContext}
            </span>
          )}
        </button>
      </div>

      {/* Context warning banner */}
      {contextWarning && (
        <div
          style={{
            padding: isPhone ? '10px 14px' : '10px 28px',
            background: 'rgba(255, 180, 50, 0.1)',
            borderBottom: '1px solid rgba(255, 180, 50, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'rgba(255, 210, 120, 0.9)',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: 'rgba(255, 180, 50, 0.8)' }}
          >
            warning
          </span>
          {contextWarning}
          <button
            onClick={() => setContextWarning(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'rgba(255, 210, 120, 0.6)',
              cursor: 'pointer',
              padding: '2px',
              fontFamily: 'var(--font-chat)',
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Chat messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: isPhone ? '16px 10px' : '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: isPhone ? '12px' : '16px',
        }}
      >
        {(!chat || chat.messages.length === 0) && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(140,82,255,0.2), rgba(81,112,255,0.15))',
                border: '1px solid rgba(140,82,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '32px', color: '#ae89ff', fontVariationSettings: "'FILL' 1" }}
              >
                auto_fix_high
              </span>
            </div>
            <div>
              <p
                style={{
                  margin: '0 0 6px',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#ede9ff',
                  fontFamily: 'var(--font-chat)',
                  fontStyle: 'normal',
                }}
              >
                {mageName} is ready
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  color: 'rgba(185,195,255,0.6)',
                  maxWidth: '360px',
                  lineHeight: 1.7,
                }}
              >
                {totalContext > 0
                  ? `I have ${totalContext} context source${totalContext !== 1 ? 's' : ''} loaded. Ask me anything about your material.`
                  : 'Feed me some documents or notebook pages to get started, then ask anything.'}
              </p>
            </div>
          </div>
        )}

        {chat?.messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'assistant' && (
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  flexShrink: 0,
                  marginRight: '10px',
                  marginTop: '2px',
                  background: 'linear-gradient(135deg, rgba(140,82,255,0.3), rgba(81,112,255,0.2))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '14px', color: '#c4a9ff', fontVariationSettings: "'FILL' 1" }}
                >
                  auto_fix_high
                </span>
              </div>
            )}
            <div
              style={{
                maxWidth:
                  msg.role === 'assistant' &&
                  (msg.content.includes('[mindmap_start:') ||
                    msg.content.includes('[presentation_start:'))
                    ? isPhone ? '100%' : '90%'
                    : isPhone ? '88%' : '70%',
                padding: isPhone ? '10px 12px' : '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background:
                  msg.role === 'user'
                    ? 'linear-gradient(135deg, #8c52ff, #5170ff)'
                    : 'rgba(255,255,255,0.07)',
                border: msg.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                color: '#ede9ff',
                fontSize: '14px',
                lineHeight: 1.65,
                whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
              }}
            >
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <MessageContent content={msg.content} notebookId={notebookId} />
              )}
            </div>
          </div>
        ))}

        {/* Streaming assistant message or stop button */}
        {isSending && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                flexShrink: 0,
                marginTop: '2px',
                background: 'linear-gradient(135deg, rgba(140,82,255,0.3), rgba(81,112,255,0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '14px', color: '#c4a9ff', fontVariationSettings: "'FILL' 1" }}
              >
                auto_fix_high
              </span>
            </div>
            {streamingText ? (
              <div
                style={{
                  maxWidth: isPhone ? '88%' : '70%',
                  padding: isPhone ? '10px 12px' : '12px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: '#ede9ff',
                  fontSize: '14px',
                  lineHeight: 1.65,
                }}
              >
                <MarkdownRenderer content={streamingText} />
              </div>
            ) : (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  gap: '4px',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#ae89ff',
                    animation: 'dotPulse 1.4s ease-in-out infinite',
                    animationDelay: '0s',
                  }}
                />
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#ae89ff',
                    animation: 'dotPulse 1.4s ease-in-out infinite',
                    animationDelay: '0.2s',
                  }}
                />
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#ae89ff',
                    animation: 'dotPulse 1.4s ease-in-out infinite',
                    animationDelay: '0.4s',
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {displayError && (
        <div
          style={{
            margin: isPhone ? '0 10px' : '0 28px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(253,111,133,0.08)',
            border: '1px solid rgba(253,111,133,0.25)',
            fontSize: '12px',
            color: '#fd6f85',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{displayError}</span>
          <button
            onClick={() => setSendError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fd6f85',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Chat input */}
      <div
        style={{
          padding: isPhone ? '10px 10px 16px' : '16px 28px 24px',
          borderTop: '1px solid rgba(140,82,255,0.06)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-end',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(140,82,255,0.15)',
            borderRadius: '14px',
            padding: '12px 14px',
            transition: 'border-color 0.15s',
          }}
          onFocus={() => {}}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${mageName} anything…`}
            rows={1}
            disabled={isSending}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ede9ff',
              fontSize: '14px',
              lineHeight: 1.6,
              fontFamily: 'var(--font-chat)',
              resize: 'none',
              minHeight: '22px',
              maxHeight: '160px',
              opacity: isSending ? 0.5 : 1,
            }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 160) + 'px';
            }}
          />
          {isSending ? (
            <button
              onClick={streamAbort}
              style={{
                width: isPhone ? '44px' : '34px',
                height: isPhone ? '44px' : '34px',
                borderRadius: '9px',
                border: 'none',
                flexShrink: 0,
                background: 'rgba(140,82,255,0.3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.45)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(140,82,255,0.3)';
              }}
            >
              <Square size={12} fill="#c4a9ff" stroke="#c4a9ff" />
            </button>
          ) : (
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
              style={{
                width: isPhone ? '44px' : '34px',
                height: isPhone ? '44px' : '34px',
                borderRadius: '9px',
                border: 'none',
                flexShrink: 0,
                background: inputValue.trim()
                  ? 'linear-gradient(135deg, #8c52ff, #5170ff)'
                  : 'rgba(140,82,255,0.2)',
                color: inputValue.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'opacity 0.15s, background 0.15s',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
              >
                send
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Feed the Mage side panel */}
      {showFeedPanel && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowFeedPanel(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(2px)',
              zIndex: 10,
            }}
          />

          {/* Panel */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: isPhone ? '100%' : '380px',
              zIndex: 11,
              background: 'linear-gradient(160deg, #1a1a36 0%, #151530 100%)',
              borderLeft: '1px solid rgba(140,82,255,0.2)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-16px 0 48px rgba(0,0,0,0.4)',
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: '20px 20px 16px',
                borderBottom: '1px solid rgba(140,82,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '18px', color: '#ae89ff', fontVariationSettings: "'FILL' 1" }}
                >
                  cloud_upload
                </span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f0edff' }}>
                  Feed {mageName}
                </h3>
              </div>
              <button
                onClick={() => setShowFeedPanel(false)}
                style={{
                  width: '26px',
                  height: '26px',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'rgba(255,255,255,0.07)',
                  color: 'rgba(237,233,255,0.4)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#ede9ff';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(255,255,255,0.07)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.4)';
                }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Context count */}
            {totalContext > 0 && (
              <div
                style={{
                  margin: '12px 20px 0',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(140,82,255,0.1)',
                  border: '1px solid rgba(140,82,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '14px', color: '#ae89ff', fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                <span style={{ fontSize: '13px', color: '#c4a9ff', fontWeight: 600 }}>
                  {totalContext} source{totalContext !== 1 ? 's' : ''} selected as context
                </span>
              </div>
            )}

            {/* Tabs */}
            <div style={{ padding: '14px 20px 0' }}>
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  background: 'rgba(255,255,255,0.07)',
                  borderRadius: '10px',
                  padding: '4px',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                {(['notebook', 'upload'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setFeedTab(tab)}
                    style={{
                      flex: 1,
                      padding: '7px 12px',
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-chat)',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      background: feedTab === tab ? 'rgba(140,82,255,0.2)' : 'transparent',
                      color: feedTab === tab ? '#d4c0ff' : 'rgba(200,210,255,0.6)',
                      transition: 'background 0.12s, color 0.12s',
                    }}
                  >
                    {tab === 'notebook' ? <BookOpen size={12} /> : <Upload size={12} />}
                    {tab === 'notebook' ? 'From Notebook' : 'Upload File'}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content */}
            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                padding: '14px 20px 0',
              }}
            >
              {feedTab === 'notebook' ? (
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    background: 'rgba(255,255,255,0.025)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  {sectionTree.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center' }}>
                      <p style={{ fontSize: '14px', color: 'rgba(200,210,255,0.65)', margin: 0 }}>
                        No sections yet. Add pages to your notebook first.
                      </p>
                    </div>
                  ) : (
                    sectionTree.map((section) => (
                      <PanelSectionItem
                        key={section.id}
                        section={section}
                        selectedPageIds={selectedPageIds}
                        onTogglePage={(id) => {
                          setSelectedPageIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(id)) next.delete(id);
                            else next.add(id);
                            return next;
                          });
                        }}
                        depth={0}
                      />
                    ))
                  )}
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    flex: 1,
                    overflow: 'hidden',
                  }}
                >
                  {/* Upload zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files[0];
                      if (file) uploadFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      borderRadius: '10px',
                      border: `2px dashed ${isDragging ? 'rgba(140,82,255,0.7)' : 'rgba(70,69,96,0.4)'}`,
                      background: isDragging ? 'rgba(140,82,255,0.05)' : 'rgba(255,255,255,0.035)',
                      padding: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, background 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(f);
                      }}
                    />
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '9px',
                        flexShrink: 0,
                        background: 'rgba(140,82,255,0.12)',
                        border: '1px solid rgba(140,82,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isUploading ? (
                        <Loader2
                          size={16}
                          style={{ color: '#ae89ff', animation: 'spin 0.8s linear infinite' }}
                        />
                      ) : (
                        <Plus size={16} style={{ color: '#ae89ff' }} />
                      )}
                    </div>
                    <div>
                      <p
                        style={{
                          margin: '0 0 1px',
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#f0edff',
                        }}
                      >
                        {isUploading ? 'Uploading…' : 'Drop or click to upload'}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#a0a0c0' }}>
                        PDF · DOCX · TXT · MD
                      </p>
                      {uploadError && (
                        <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#fd6f85' }}>
                          {uploadError}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Doc list */}
                  {documents.length > 0 && (
                    <div
                      style={{
                        flex: 1,
                        overflowY: 'auto',
                        background: 'rgba(255,255,255,0.025)',
                        borderRadius: '10px',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div
                        style={{
                          padding: '8px 12px 4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'rgba(200,210,255,0.6)',
                          letterSpacing: '0.07em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Vault documents
                      </div>
                      {documents.map((doc) => {
                        const isSelected = selectedDocIds.has(doc.id);
                        return (
                          <div
                            key={doc.id}
                            onClick={() =>
                              setSelectedDocIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(doc.id)) next.delete(doc.id);
                                else next.add(doc.id);
                                return next;
                              })
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '9px 12px',
                              cursor: 'pointer',
                              background: isSelected ? 'rgba(140,82,255,0.08)' : 'transparent',
                              borderTop: '1px solid rgba(255,255,255,0.06)',
                              transition: 'background 0.1s',
                            }}
                          >
                            <div
                              style={{
                                width: '16px',
                                height: '16px',
                                borderRadius: '4px',
                                flexShrink: 0,
                                border: `1.5px solid ${isSelected ? '#8c52ff' : 'rgba(140,82,255,0.25)'}`,
                                background: isSelected ? '#8c52ff' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'border-color 0.1s, background 0.1s',
                              }}
                            >
                              {isSelected && <Check size={10} style={{ color: '#fff' }} />}
                            </div>
                            <span
                              style={{
                                fontSize: '13px',
                                color: 'rgba(237,233,255,0.85)',
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {doc.fileName}
                            </span>
                            <span style={{ fontSize: '11px', color: '#a0a0c0', flexShrink: 0 }}>
                              {formatBytes(doc.fileSize)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Save button */}
            <div
              style={{
                padding: '14px 20px 20px',
                borderTop: '1px solid rgba(140,82,255,0.08)',
                marginTop: '14px',
              }}
            >
              <button
                onClick={handleSaveContext}
                disabled={isSavingContext}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '10px',
                  border: 'none',
                  background: isSavingContext
                    ? 'rgba(140,82,255,0.4)'
                    : 'linear-gradient(135deg, #8c52ff, #5170ff)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: isSavingContext ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font-chat)',
                  boxShadow: isSavingContext ? 'none' : '0 4px 16px rgba(140,82,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  transition: 'opacity 0.15s',
                }}
              >
                {isSavingContext ? (
                  <>
                    <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…
                  </>
                ) : (
                  <>Update Context</>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function PanelSectionItem({
  section,
  selectedPageIds,
  onTogglePage,
  depth,
}: {
  section: SectionRef;
  selectedPageIds: Set<string>;
  onTogglePage: (id: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: `7px 12px 7px ${12 + depth * 14}px`,
          cursor: 'pointer',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span style={{ color: 'rgba(200,210,255,0.7)', display: 'flex' }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'rgba(210,215,255,0.8)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flex: 1,
          }}
        >
          {section.title}
        </span>
        {section.pages.length > 0 && (
          <span style={{ fontSize: '11px', color: 'rgba(200,210,255,0.5)' }}>
            {section.pages.filter((p) => selectedPageIds.has(p.id)).length}/{section.pages.length}
          </span>
        )}
      </div>

      {open && (
        <>
          {section.pages.map((page) => {
            const isSelected = selectedPageIds.has(page.id);
            return (
              <div
                key={page.id}
                onClick={() => onTogglePage(page.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: `7px 12px 7px ${24 + depth * 14}px`,
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(140,82,255,0.08)' : 'transparent',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  transition: 'background 0.1s',
                }}
              >
                <div
                  style={{
                    width: '15px',
                    height: '15px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    border: `1.5px solid ${isSelected ? '#8c52ff' : 'rgba(140,82,255,0.25)'}`,
                    background: isSelected ? '#8c52ff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                >
                  {isSelected && <Check size={9} style={{ color: '#fff' }} />}
                </div>
                <span
                  style={{
                    fontSize: '13px',
                    color: isSelected ? '#f0edff' : 'rgba(237,233,255,0.75)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {page.title}
                </span>
              </div>
            );
          })}
          {section.children?.map((child) => (
            <PanelSectionItem
              key={child.id}
              section={child}
              selectedPageIds={selectedPageIds}
              onTogglePage={onTogglePage}
              depth={depth + 1}
            />
          ))}
          {section.pages.length === 0 && !section.children?.length && (
            <div style={{ padding: `6px 12px 6px ${24 + depth * 14}px` }}>
              <span style={{ fontSize: '12px', color: 'rgba(200,210,255,0.45)' }}>No pages</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MessageContent — Renders message text with flashcard/quiz links & inline mindmaps
   ═══════════════════════════════════════════════════════════════════════════ */

const SET_MARKER_RE = /\[(flashcard_set|quiz_set):([^\]]+)\]/g;
const MINDMAP_RE = /\[mindmap_start:([^\]]+)\]\n([\s\S]*?)\n\[mindmap_end\]/g;
const PRESENTATION_RE = /\[presentation_start:([^\]]+)\]\n([\s\S]*?)\n\[presentation_end\]/g;
const YOUTUBE_VIDEOS_RE = /\[youtube_videos_start:([^\]]+)\]\n([\s\S]*?)\n\[youtube_videos_end\]/g;

function PresentationButton({ title, jsonData }: { title: string; jsonData: string }) {
  const [showModal, setShowModal] = useState(false);
  const [hovered, setHovered] = useState(false);

  let parsed: { themeColor?: string; slides?: unknown[] } | null = null;
  try {
    parsed = JSON.parse(jsonData);
  } catch {
    /* invalid JSON */
  }

  if (!parsed || !parsed.slides) return null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          margin: '6px 0',
          borderRadius: '10px',
          background: hovered
            ? 'linear-gradient(135deg, rgba(255,140,50,0.3), rgba(140,82,255,0.25))'
            : 'linear-gradient(135deg, rgba(255,140,50,0.2), rgba(140,82,255,0.15))',
          border: `1px solid ${hovered ? 'rgba(255,140,50,0.5)' : 'rgba(255,140,50,0.3)'}`,
          color: '#ffb380',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'var(--font-chat)',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        <Presentation size={14} />
        View Powerpoint — {title}
      </button>
      {showModal && (
        <SlideEditorModal
          initialSlides={[]}
          presentationTitle={title}
          presentationSlides={
            parsed.slides as import('@/components/notebook/SlideEditorModal').PresentationSlideData[]
          }
          themeColor={parsed.themeColor}
          onExport={() => setShowModal(false)}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

function YouTubeVideoCards({ jsonData }: { jsonData: string }) {
  const videos: { videoId: string; title: string; channelTitle: string; thumbnailUrl: string }[] =
    useMemo(() => {
      try {
        return JSON.parse(jsonData);
      } catch {
        return [];
      }
    }, [jsonData]);

  if (videos.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0' }}>
      <div
        style={{
          fontSize: '12px',
          color: 'rgba(237,233,255,0.45)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <Youtube size={13} style={{ color: '#ff4444' }} />
        Recommended videos
      </div>
      {videos.map((video) => (
        <a
          key={video.videoId}
          href={`https://www.youtube.com/watch?v=${video.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            padding: '10px 12px',
            borderRadius: '10px',
            background: 'rgba(255,0,0,0.06)',
            border: '1px solid rgba(255,60,60,0.15)',
            textDecoration: 'none',
            color: 'inherit',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,0,0,0.12)';
            e.currentTarget.style.borderColor = 'rgba(255,60,60,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,0,0,0.06)';
            e.currentTarget.style.borderColor = 'rgba(255,60,60,0.15)';
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.thumbnailUrl}
            alt=""
            style={{
              width: '120px',
              height: '68px',
              borderRadius: '6px',
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#ede9ff',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical' as const,
              }}
            >
              {video.title}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(237,233,255,0.45)', marginTop: '4px' }}>
              {video.channelTitle}
            </div>
          </div>
          <Youtube size={20} style={{ color: '#ff4444', flexShrink: 0 }} />
        </a>
      ))}
    </div>
  );
}

function MessageContent({ content, notebookId }: { content: string; notebookId: string }) {
  const hasSetMarkers = content.includes('[flashcard_set:') || content.includes('[quiz_set:');
  const hasMindmap = content.includes('[mindmap_start:');
  const hasPresentation = content.includes('[presentation_start:');
  const hasYouTubeVideos = content.includes('[youtube_videos_start:');

  // No markers — render as markdown directly
  if (!hasSetMarkers && !hasMindmap && !hasPresentation && !hasYouTubeVideos) {
    return <MarkdownRenderer content={content} />;
  }

  // Parse all markers (mindmaps + presentations + youtube videos + set links) and render in order
  const parts: React.ReactNode[] = [];
  const remaining = content;
  let partKey = 0;

  // First, extract multi-line blocks (mindmaps, presentations, and youtube videos)
  const segments: {
    type: 'text' | 'mindmap' | 'presentation' | 'youtube_videos';
    value: string;
    title?: string;
  }[] = [];
  const MULTILINE_RE =
    /\[(mindmap_start|presentation_start|youtube_videos_start):([^\]]+)\]\n([\s\S]*?)\n\[(mindmap_end|presentation_end|youtube_videos_end)\]/g;
  let multiLastIndex = 0;
  const multiRegex = new RegExp(MULTILINE_RE);
  let multiMatch: RegExpExecArray | null;

  while ((multiMatch = multiRegex.exec(remaining)) !== null) {
    if (multiMatch.index > multiLastIndex) {
      segments.push({ type: 'text', value: remaining.slice(multiLastIndex, multiMatch.index) });
    }
    const blockType =
      multiMatch[1] === 'mindmap_start'
        ? 'mindmap'
        : multiMatch[1] === 'presentation_start'
          ? 'presentation'
          : 'youtube_videos';
    segments.push({ type: blockType, value: multiMatch[3], title: multiMatch[2] });
    multiLastIndex = multiMatch.index + multiMatch[0].length;
  }
  if (multiLastIndex < remaining.length) {
    segments.push({ type: 'text', value: remaining.slice(multiLastIndex) });
  }

  // Now process each segment
  for (const segment of segments) {
    if (segment.type === 'mindmap') {
      parts.push(
        <MindmapRenderer
          key={`mindmap-${partKey++}`}
          title={segment.title!}
          markdown={segment.value}
          notebookId={notebookId}
        />
      );
      continue;
    }

    if (segment.type === 'presentation') {
      parts.push(
        <PresentationButton
          key={`pres-${partKey++}`}
          title={segment.title!}
          jsonData={segment.value}
        />
      );
      continue;
    }

    if (segment.type === 'youtube_videos') {
      parts.push(<YouTubeVideoCards key={`yt-${partKey++}`} jsonData={segment.value} />);
      continue;
    }

    // Process text segment for set markers (flashcard/quiz)
    const text = segment.value;
    if (!text.includes('[flashcard_set:') && !text.includes('[quiz_set:')) {
      const trimmed = text.trim();
      if (trimmed) {
        parts.push(<MarkdownRenderer key={`md-${partKey++}`} content={trimmed} />);
      }
      continue;
    }

    let setLastIndex = 0;
    let setMatch: RegExpExecArray | null;
    const setRegex = new RegExp(SET_MARKER_RE);

    while ((setMatch = setRegex.exec(text)) !== null) {
      if (setMatch.index > setLastIndex) {
        const textChunk = text.slice(setLastIndex, setMatch.index).trim();
        if (textChunk) {
          parts.push(<MarkdownRenderer key={`md-${partKey++}`} content={textChunk} />);
        }
      }

      const markerType = setMatch[1];
      const setId = setMatch[2];
      const isQuiz = markerType === 'quiz_set';

      parts.push(
        <Link
          key={`${markerType}-${partKey++}`}
          href={
            isQuiz
              ? `/notebooks/${notebookId}/quizzes/${setId}`
              : `/notebooks/${notebookId}/flashcards/${setId}`
          }
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            margin: '6px 0',
            borderRadius: '10px',
            background: isQuiz
              ? 'linear-gradient(135deg, rgba(81,112,255,0.2), rgba(140,82,255,0.15))'
              : 'linear-gradient(135deg, rgba(140,82,255,0.2), rgba(81,112,255,0.15))',
            border: `1px solid ${isQuiz ? 'rgba(81,112,255,0.3)' : 'rgba(140,82,255,0.3)'}`,
            color: isQuiz ? '#93a8ff' : '#c4a9ff',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = isQuiz
              ? 'linear-gradient(135deg, rgba(81,112,255,0.3), rgba(140,82,255,0.25))'
              : 'linear-gradient(135deg, rgba(140,82,255,0.3), rgba(81,112,255,0.25))';
            (e.currentTarget as HTMLAnchorElement).style.borderColor = isQuiz
              ? 'rgba(81,112,255,0.5)'
              : 'rgba(140,82,255,0.5)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.background = isQuiz
              ? 'linear-gradient(135deg, rgba(81,112,255,0.2), rgba(140,82,255,0.15))'
              : 'linear-gradient(135deg, rgba(140,82,255,0.2), rgba(81,112,255,0.15))';
            (e.currentTarget as HTMLAnchorElement).style.borderColor = isQuiz
              ? 'rgba(81,112,255,0.3)'
              : 'rgba(140,82,255,0.3)';
          }}
        >
          {isQuiz ? <HelpCircle size={14} /> : <Layers size={14} />}
          {isQuiz ? 'Open Quiz' : 'Open Flashcards'}
        </Link>
      );

      setLastIndex = setMatch.index + setMatch[0].length;
    }

    if (setLastIndex < text.length) {
      const tail = text.slice(setLastIndex).trim();
      if (tail) {
        parts.push(<MarkdownRenderer key={`md-${partKey++}`} content={tail} />);
      }
    }
  }

  return <>{parts}</>;
}
