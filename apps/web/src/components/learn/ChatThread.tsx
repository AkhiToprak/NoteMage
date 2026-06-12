'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { getMageName } from '@/lib/scholar';
import Link from 'next/link';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { useStreamingChat } from '@/hooks/useStreamingChat';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import VideoInputMask from '@/components/video/VideoInputMask';
import dynamic from 'next/dynamic';

const MindmapRenderer = dynamic(() => import('@/components/notebook/MindmapRenderer'), {
  ssr: false,
});
const SlideEditorModal = dynamic(() => import('@/components/notebook/SlideEditorModal'), {
  ssr: false,
});

// ── Types ─────────────────────────────────────────────────────────────────

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
  notebookId: string | null;
  contextPageIds: string[];
  contextDocIds: string[];
  contextNotebookIds: string[];
  createdAt: string;
  messages: ChatMessage[];
}

interface DocumentItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

interface PageRef {
  id: string;
  title: string;
}
interface SectionRef {
  id: string;
  title: string;
  pages: PageRef[];
  children?: SectionRef[];
}

interface SectionApi {
  id: string;
  title: string;
  parentId: string | null;
  sortOrder: number;
  pages: { id: string; title: string; sortOrder: number }[];
}

interface FlashcardSetSummary {
  id: string;
  notebookId: string | null;
}

interface QuizSetSummary {
  id: string;
  notebookId: string | null;
}

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

const VIDEO_TRANSCRIPT_TYPE = 'text/youtube-transcript';

/** A document sourced from a YouTube transcript — shown with a video glyph. */
function isVideoTranscript(doc: DocumentItem): boolean {
  return doc.fileType === VIDEO_TRANSCRIPT_TYPE;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ChatThread({ chatId }: { chatId: string }) {
  const { upload: directUpload } = useDirectUpload();
  const { isPhone } = useBreakpoint();
  const { data: session } = useSession();
  const mageName = getMageName(session?.user?.scholarName);

  const [chat, setChat] = useState<ChatData | null>(null);
  const [sections, setSections] = useState<SectionApi[]>([]);
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

  // Map of flashcard/quiz set IDs → notebook IDs, populated on demand so deep
  // links inside `MessageContent` resolve when the chat itself has no primary
  // notebook (Phase 9 cross-notebook chats).
  const [setNotebookMap, setSetNotebookMap] = useState<Map<string, string | null>>(new Map());

  const {
    streamingText,
    status: streamStatus,
    send: streamSend,
    abort: streamAbort,
    error: streamError,
  } = useStreamingChat({ endpoint: `/api/learn/chats/${chatId}/messages` });
  const isSending = streamStatus === 'streaming';
  const displayError = sendError || streamError;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchChat = useCallback(async () => {
    const res = await fetch(`/api/learn/chats/${chatId}`);
    const json = await res.json();
    if (json.success && json.data) {
      const data = json.data as ChatData;
      setChat(data);
      setSelectedPageIds(new Set(data.contextPageIds));
      setSelectedDocIds(new Set(data.contextDocIds));
    }
  }, [chatId]);

  const fetchSections = useCallback(async (notebookId: string) => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sections`);
      const json = await res.json();
      if (json.success) setSections((json.data ?? []) as SectionApi[]);
      else setSections([]);
    } catch {
      setSections([]);
    }
  }, []);

  const fetchDocs = useCallback(async (notebookId: string | null) => {
    if (!notebookId) {
      // Cross-notebook chat — fall back to inbox uploads.
      try {
        const res = await fetch('/api/learn/uploads');
        const json = await res.json();
        if (json.success) setDocuments((json.data ?? []) as DocumentItem[]);
        else setDocuments([]);
      } catch {
        setDocuments([]);
      }
      return;
    }
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/documents`);
      const json = await res.json();
      if (json.success) setDocuments((json.data ?? []) as DocumentItem[]);
      else setDocuments([]);
    } catch {
      setDocuments([]);
    }
  }, []);

  useEffect(() => {
    void fetchChat();
  }, [fetchChat]);

  useEffect(() => {
    if (!chat) return;
    if (chat.notebookId) {
      void fetchSections(chat.notebookId);
    } else {
      setSections([]);
    }
    void fetchDocs(chat.notebookId);
  }, [chat, fetchSections, fetchDocs]);

  // Collect every flashcard/quiz set referenced inside the chat's messages, then
  // fetch the user's full lists once to build the id→notebook map. We avoid a
  // network call per render by gating on `setIds` membership.
  const referencedSetIds = useMemo(() => {
    const ids = new Set<string>();
    if (!chat) return ids;
    const re = /\[(flashcard_set|quiz_set):([^\]]+)\]/g;
    for (const message of chat.messages) {
      if (message.role !== 'assistant') continue;
      let match: RegExpExecArray | null;
      while ((match = re.exec(message.content)) !== null) {
        ids.add(match[2]);
      }
    }
    return ids;
  }, [chat]);

  useEffect(() => {
    if (referencedSetIds.size === 0) return;
    // Only fetch if there's at least one id we haven't resolved yet.
    let needsFetch = false;
    for (const id of referencedSetIds) {
      if (!setNotebookMap.has(id)) {
        needsFetch = true;
        break;
      }
    }
    if (!needsFetch) return;

    let cancelled = false;
    const run = async () => {
      try {
        const [fcRes, qzRes] = await Promise.all([
          fetch('/api/flashcard-sets'),
          fetch('/api/quiz-sets'),
        ]);
        const fcJson = await fcRes.json();
        const qzJson = await qzRes.json();
        if (cancelled) return;
        const next = new Map(setNotebookMap);
        if (fcJson?.success) {
          for (const set of fcJson.data as FlashcardSetSummary[]) {
            next.set(set.id, set.notebookId);
          }
        }
        if (qzJson?.success) {
          for (const set of qzJson.data as QuizSetSummary[]) {
            next.set(set.id, set.notebookId);
          }
        }
        setSetNotebookMap(next);
      } catch {
        // best-effort; deep links will render but won't navigate.
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // We intentionally exclude setNotebookMap from deps — using its current
    // value to detect missing ids, but re-running on each change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referencedSetIds]);

  // Auto-scroll to bottom when messages change or streaming text updates.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.messages, streamingText]);

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text || isSending) return;

    setSendError(null);

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setChat((prev) => (prev ? { ...prev, messages: [...prev.messages, tempUserMsg] } : prev));
    setInputValue('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const donePayload = await streamSend(text);

      if (donePayload) {
        if (donePayload.aborted) {
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
          const { userMessage, assistantMessage, contextStatus, chatTitle } = donePayload;

          setChat((prev) => {
            if (!prev) return prev;
            const filtered = prev.messages.filter((m) => m.id !== tempUserMsg.id);
            return {
              ...prev,
              title: chatTitle ?? prev.title,
              messages: [...filtered, userMessage, assistantMessage],
            };
          });

          if (chatTitle) {
            window.dispatchEvent(
              new CustomEvent('notemage:chat-title-updated', {
                detail: { chatId, title: chatTitle },
              }),
            );
          }

          const warnings: string[] = [];
          if (
            contextStatus &&
            Array.isArray(contextStatus.skipped) &&
            contextStatus.skipped.length > 0
          ) {
            const names = contextStatus.skipped.map((s: { name: string }) => s.name).join(', ');
            warnings.push(
              `${contextStatus.skipped.length} Quelle(n) konnten nicht gelesen werden: ${names}`
            );
          }
          if (contextStatus?.truncated) {
            const kept = contextStatus.keptChars ?? 0;
            const original = contextStatus.originalChars ?? 0;
            const keptK = Math.round(kept / 1000);
            const originalK = Math.round(original / 1000);
            warnings.push(
              `Kontext gekürzt, damit er ins Modell passt (${keptK}k von ${originalK}k Zeichen verwendet).`
            );
          }
          if (warnings.length > 0) {
            setContextWarning(warnings.join(' · '));
            setTimeout(() => setContextWarning(null), 10_000);
          } else {
            setContextWarning(null);
          }
        }
      } else {
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
      void handleSendMessage();
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
      const notebookId = chat?.notebookId ?? null;

      let storagePath: string;
      try {
        const uploadContext = notebookId ? { notebookId } : undefined;
        const result = await directUpload(file, 'document', uploadContext);
        storagePath = result.storagePath;
      } catch (err) {
        console.error('[mage-upload] direct-upload failed', err);
        const message = err instanceof Error ? err.message : 'Upload failed';
        setUploadError(`Upload failed: ${message}`);
        return;
      }

      const uploadEndpoint = notebookId
        ? `/api/notebooks/${notebookId}/documents`
        : '/api/learn/uploads';

      let docRes: Response;
      try {
        docRes = await fetch(uploadEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, fileName: file.name, fileType: file.type }),
        });
      } catch (err) {
        console.error('[mage-upload] documents POST request failed', err);
        const message = err instanceof Error ? err.message : 'Network error';
        setUploadError(`Document save failed: ${message}`);
        return;
      }

      if (!docRes.ok) {
        const body = await docRes.text().catch(() => '');
        console.error('[mage-upload] documents POST non-OK', docRes.status, body);
        setUploadError(`Document save failed (HTTP ${docRes.status})`);
        return;
      }

      const json = await docRes.json().catch((err) => {
        console.error('[mage-upload] documents POST JSON parse failed', err);
        return null;
      });

      if (!json || !json.success || !json.data?.id) {
        console.error('[mage-upload] documents POST returned error payload', json);
        setUploadError(json?.error ?? 'Upload failed. Please try again.');
        return;
      }

      await fetchDocs(notebookId);
      const newDocIds = new Set([...selectedDocIds, json.data.id]);
      setSelectedDocIds(newDocIds);

      try {
        await fetch(`/api/learn/chats/${chatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextDocIds: [...newDocIds] }),
        });
        setChat((prev) => (prev ? { ...prev, contextDocIds: [...newDocIds] } : prev));
      } catch (err) {
        console.warn('[mage-upload] chat context PATCH failed', err);
        setUploadError('Document uploaded but failed to attach to chat — try Update Context.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Attach a pasted YouTube URL as a transcript Document, then add it to the
  // chat context — mirrors `uploadFile`'s post-step (fetchDocs → PATCH
  // contextDocIds). Notebook chats hit the notebook route; cross-notebook
  // chats hit the learn-scoped route (auto-creates an Inbox notebook). A 422
  // (no captions) is re-thrown as the mask's CaptionsUnavailable error so the
  // card can render the Lane-2 upsell inline.
  const attachYouTubeUrl = useCallback(
    async (url: string) => {
      const notebookId = chat?.notebookId ?? null;
      const endpoint = notebookId
        ? `/api/notebooks/${notebookId}/documents/youtube`
        : '/api/learn/documents/youtube';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (res.status === 422) {
        const err = new Error('Captions unavailable');
        err.name = 'CaptionsUnavailable';
        throw err;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json.data?.document?.id) {
        throw new Error(json?.error ?? 'Could not add this video.');
      }

      const newDocId = json.data.document.id as string;
      await fetchDocs(notebookId);
      const newDocIds = new Set([...selectedDocIds, newDocId]);
      setSelectedDocIds(newDocIds);

      try {
        await fetch(`/api/learn/chats/${chatId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contextDocIds: [...newDocIds] }),
        });
        setChat((prev) => (prev ? { ...prev, contextDocIds: [...newDocIds] } : prev));
      } catch (err) {
        console.warn('[mage-youtube] chat context PATCH failed', err);
      }
    },
    [chat?.notebookId, chatId, fetchDocs, selectedDocIds],
  );

  const handleSaveContext = async () => {
    if (!chat) return;
    setIsSavingContext(true);
    try {
      await fetch(`/api/learn/chats/${chatId}`, {
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

  // Build section tree from API response (root sections + their children).
  const sectionTree: SectionRef[] = useMemo(() => {
    return sections
      .filter((s) => !s.parentId)
      .map((s) => ({
        id: s.id,
        title: s.title,
        pages: s.pages.map((p) => ({ id: p.id, title: p.title })),
        children: sections
          .filter((c) => c.parentId === s.id)
          .map((c) => ({
            id: c.id,
            title: c.title,
            pages: c.pages.map((p) => ({ id: p.id, title: p.title })),
          })),
      }));
  }, [sections]);

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
          borderBottom: '1px solid rgba(174,137,255,0.16)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isPhone ? '8px' : '16px',
          background: 'var(--surface-container-low)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              background: 'rgba(140,82,255,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '15px', color: 'var(--md-h3)', fontVariationSettings: "'FILL' 1" }}
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
                color: 'var(--on-surface)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {chat?.title ?? '…'}
            </h1>
            {totalContext > 0 && (
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--on-surface-variant)' }}>
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
            color: 'var(--md-h3)',
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
                color: 'var(--md-em)',
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
            borderBottom: '1px solid rgba(255, 180, 50, 0.40)',
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
            <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>close</span>
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
                background: 'rgba(140,82,255,0.2)',
                border: '1px solid rgba(140,82,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '32px', color: 'var(--md-h4)', fontVariationSettings: "'FILL' 1" }}
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
                  color: 'var(--on-surface)',
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
                  color: 'var(--on-surface-variant)',
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
                  background: 'rgba(140,82,255,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '14px', color: 'var(--md-h3)', fontVariationSettings: "'FILL' 1" }}
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
                    ? isPhone
                      ? '100%'
                      : '90%'
                    : isPhone
                      ? '88%'
                      : '70%',
                padding: isPhone ? '10px 12px' : '12px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? 'var(--accent-strong)' : 'var(--ink-08)',
                border: msg.role === 'user' ? 'none' : '1px solid var(--ink-08)',
                color: msg.role === 'user' ? 'var(--on-primary-container)' : 'var(--on-surface)',
                fontSize: '14px',
                lineHeight: 1.65,
                whiteSpace: msg.role === 'user' ? 'pre-wrap' : undefined,
              }}
            >
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <MessageContent
                  content={msg.content}
                  chatNotebookId={chat?.notebookId ?? null}
                  setNotebookMap={setNotebookMap}
                />
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
                background: 'rgba(140,82,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '14px', color: 'var(--md-h3)', fontVariationSettings: "'FILL' 1" }}
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
                  background: 'var(--ink-08)',
                  border: '1px solid var(--ink-12)',
                  color: 'var(--on-surface)',
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
                  background: 'var(--ink-08)',
                  border: '1px solid var(--ink-12)',
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
                    background: 'var(--brand-purple)',
                    animation: 'dotPulse 1.4s ease-in-out infinite',
                    animationDelay: '0s',
                  }}
                />
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--brand-purple)',
                    animation: 'dotPulse 1.4s ease-in-out infinite',
                    animationDelay: '0.2s',
                  }}
                />
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--brand-purple)',
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
            color: 'var(--error)',
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
              color: 'var(--error)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>close</span>
          </button>
        </div>
      )}

      {/* Chat input */}
      <div
        style={{
          padding: isPhone ? '10px 10px 16px' : '16px 28px 24px',
          borderTop: '1px solid rgba(174,137,255,0.12)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-end',
            background: 'var(--ink-08)',
            border: '1px solid rgba(140,82,255,0.15)',
            borderRadius: '14px',
            padding: '12px 14px',
            transition: 'border-color 0.15s',
          }}
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
              color: 'var(--on-surface)',
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
              <span className="material-symbols-outlined filled" style={{ fontSize: 12, color: 'var(--md-h3)' }} aria-hidden>stop</span>
            </button>
          ) : (
            <button
              onClick={() => void handleSendMessage()}
              disabled={!inputValue.trim()}
              style={{
                width: isPhone ? '44px' : '34px',
                height: isPhone ? '44px' : '34px',
                borderRadius: '9px',
                border: 'none',
                flexShrink: 0,
                background: inputValue.trim() ? 'var(--accent-strong)' : 'rgb(var(--accent-strong-rgb) / 0.2)',
                color: inputValue.trim() ? 'var(--on-primary-container)' : 'var(--ink-30)',
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

          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: isPhone ? '100%' : '380px',
              zIndex: 11,
              background: 'var(--surface-container-lowest)',
              borderLeft: '1px solid rgba(174,137,255,0.40)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-16px 0 48px rgba(0,0,0,0.4)',
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: '20px 20px 16px',
                borderBottom: '1px solid rgba(174,137,255,0.20)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '18px', color: 'var(--md-h4)', fontVariationSettings: "'FILL' 1" }}
                >
                  cloud_upload
                </span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--on-surface)' }}>
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
                  background: 'var(--ink-08)',
                  color: 'var(--ink-40)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.12s, color 0.12s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--ink-12)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--on-surface)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--ink-08)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-40)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>close</span>
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
                  style={{ fontSize: '14px', color: 'var(--md-h4)', fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
                <span style={{ fontSize: '13px', color: 'var(--md-h3)', fontWeight: 600 }}>
                  {totalContext} source{totalContext !== 1 ? 's' : ''} selected as context
                </span>
              </div>
            )}

            {/* For cross-notebook chats we only surface the documents tab (the
                pages picker would need the full multi-notebook tree, which is
                the dedicated CreateChatModal job). */}
            {chat?.notebookId ? (
              <>
                {/* Tabs */}
                <div style={{ padding: '14px 20px 0' }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: '4px',
                      background: 'var(--ink-08)',
                      borderRadius: '10px',
                      padding: '4px',
                      border: '1px solid var(--ink-12)',
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
                          color: feedTab === tab ? 'var(--md-em)' : 'var(--ink-60)',
                          transition: 'background 0.12s, color 0.12s',
                        }}
                      >
                        {tab === 'notebook' ? <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>menu_book</span> : <span className="material-symbols-outlined" style={{ fontSize: 12 }} aria-hidden>upload</span>}
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
                        background: 'var(--ink-04)',
                        borderRadius: '10px',
                        border: '1px solid var(--ink-12)',
                      }}
                    >
                      {sectionTree.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center' }}>
                          <p
                            style={{
                              fontSize: '14px',
                              color: 'var(--ink-60)',
                              margin: 0,
                            }}
                          >
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
                    <UploadAndDocsList
                      documents={documents}
                      selectedDocIds={selectedDocIds}
                      setSelectedDocIds={setSelectedDocIds}
                      isDragging={isDragging}
                      setIsDragging={setIsDragging}
                      isUploading={isUploading}
                      uploadError={uploadError}
                      fileInputRef={fileInputRef}
                      uploadFile={uploadFile}
                      onAttachYouTubeUrl={attachYouTubeUrl}
                    />
                  )}
                </div>
              </>
            ) : (
              // TODO(phase9.4): Build a richer multi-notebook picker so users
              // can edit cross-notebook context without rebuilding the chat.
              <div
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '14px 20px 0',
                  gap: '10px',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    padding: '10px 12px',
                    fontSize: '12px',
                    lineHeight: 1.6,
                    color: 'var(--ink-70)',
                    background: 'rgba(140,82,255,0.06)',
                    border: '1px solid rgba(140,82,255,0.18)',
                    borderRadius: '8px',
                  }}
                >
                  This chat draws from multiple sources — manage context via the chat detail&apos;s
                  context viewer (coming in Phase 9.4).
                </p>
                <UploadAndDocsList
                  documents={documents}
                  selectedDocIds={selectedDocIds}
                  setSelectedDocIds={setSelectedDocIds}
                  isDragging={isDragging}
                  setIsDragging={setIsDragging}
                  isUploading={isUploading}
                  uploadError={uploadError}
                  fileInputRef={fileInputRef}
                  uploadFile={uploadFile}
                  onAttachYouTubeUrl={attachYouTubeUrl}
                />
              </div>
            )}

            {/* Save button */}
            <div
              style={{
                padding: '14px 20px 20px',
                borderTop: '1px solid rgba(174,137,255,0.16)',
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
                  background: isSavingContext ? 'rgb(var(--accent-strong-rgb) / 0.4)' : 'var(--accent-strong)',
                  color: 'var(--on-primary-container)',
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
                    <span className="material-symbols-outlined" style={{ fontSize: 13, animation: 'spin 0.8s linear infinite' }} aria-hidden>progress_activity</span> Saving…
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

// ── Upload + docs list (used by both the "From Notebook" and cross-notebook
// branches of the Feed panel) ────────────────────────────────────────────

function UploadAndDocsList({
  documents,
  selectedDocIds,
  setSelectedDocIds,
  isDragging,
  setIsDragging,
  isUploading,
  uploadError,
  fileInputRef,
  uploadFile,
  onAttachYouTubeUrl,
}: {
  documents: DocumentItem[];
  selectedDocIds: Set<string>;
  setSelectedDocIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  isDragging: boolean;
  setIsDragging: React.Dispatch<React.SetStateAction<boolean>>;
  isUploading: boolean;
  uploadError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploadFile: (file: File) => Promise<void>;
  onAttachYouTubeUrl: (url: string) => Promise<void>;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        flex: 1,
        overflow: 'hidden',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a file"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void uploadFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        style={{
          borderRadius: '10px',
          border: `2px dashed ${isDragging ? 'rgba(140,82,255,0.7)' : 'rgba(70,69,96,0.4)'}`,
          background: isDragging ? 'rgba(140,82,255,0.05)' : 'var(--ink-04)',
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
          aria-label="File upload"
          accept=".pdf,.docx,.txt,.md"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
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
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--md-h4)', animation: 'spin 0.8s linear infinite' }} aria-hidden>progress_activity</span>
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--md-h4)' }} aria-hidden>add</span>
          )}
        </div>
        <div>
          <p
            style={{
              margin: '0 0 1px',
              fontSize: '14px',
              fontWeight: 700,
              color: 'var(--on-surface)',
            }}
          >
            {isUploading ? 'Uploading…' : 'Drop or click to upload'}
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)' }}>PDF · DOCX · TXT · MD</p>
          {uploadError && (
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--error)' }}>{uploadError}</p>
          )}
        </div>
      </div>

      <VideoInputMask dense onConfirmUrl={({ url }) => onAttachYouTubeUrl(url)} />

      {documents.length > 0 && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            background: 'var(--ink-04)',
            borderRadius: '10px',
            border: '1px solid var(--ink-12)',
          }}
        >
          <div
            style={{
              padding: '8px 12px 4px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--ink-60)',
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
                  borderTop: '1px solid var(--ink-12)',
                  transition: 'background 0.1s',
                }}
              >
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    border: `1.5px solid ${isSelected ? 'var(--accent-strong)' : 'rgba(140,82,255,0.25)'}`,
                    background: isSelected ? 'var(--accent-strong)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                >
                  {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 10, color: 'var(--on-primary-container)' }} aria-hidden>check</span>}
                </div>
                {isVideoTranscript(doc) && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 15, color: 'var(--on-surface-variant)', flexShrink: 0 }}
                    aria-hidden
                  >
                    smart_display
                  </span>
                )}
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--ink-80)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {doc.fileName}
                  {isVideoTranscript(doc) ? (
                    <span style={{ color: 'var(--on-surface-variant)' }}> · Video</span>
                  ) : null}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', flexShrink: 0 }}>
                  {formatBytes(doc.fileSize)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PanelSectionItem ──────────────────────────────────────────────────────

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
          borderBottom: '1px solid var(--ink-12)',
        }}
      >
        <span style={{ color: 'var(--ink-70)', display: 'flex' }}>
          {open ? <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>expand_more</span> : <span className="material-symbols-outlined" style={{ fontSize: 13 }} aria-hidden>chevron_right</span>}
        </span>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--ink-80)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            flex: 1,
          }}
        >
          {section.title}
        </span>
        {section.pages.length > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--ink-50)' }}>
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
                  borderBottom: '1px solid var(--ink-12)',
                  transition: 'background 0.1s',
                }}
              >
                <div
                  style={{
                    width: '15px',
                    height: '15px',
                    borderRadius: '4px',
                    flexShrink: 0,
                    border: `1.5px solid ${isSelected ? 'var(--accent-strong)' : 'rgba(140,82,255,0.25)'}`,
                    background: isSelected ? 'var(--accent-strong)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                >
                  {isSelected && <span className="material-symbols-outlined" style={{ fontSize: 9, color: 'var(--on-primary-container)' }} aria-hidden>check</span>}
                </div>
                <span
                  style={{
                    fontSize: '13px',
                    color: isSelected ? 'var(--on-surface)' : 'var(--ink-70)',
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
              <span style={{ fontSize: '12px', color: 'var(--ink-40)' }}>No pages</span>
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
          background: hovered ? 'rgba(255,140,50,0.3)' : 'rgba(255,140,50,0.2)',
          border: `1px solid ${hovered ? 'rgba(255,140,50,0.5)' : 'rgba(255,140,50,0.3)'}`,
          color: 'var(--warning)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'var(--font-chat)',
          transition: 'background 0.15s ease, border-color 0.15s ease',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>slideshow</span>
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
          color: 'var(--ink-40)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#ff4444' }} aria-hidden>smart_display</span>
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
            alt={video.title ? `Thumbnail for ${video.title}` : 'Video thumbnail'}
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
                color: 'var(--on-surface)',
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
            <div
              style={{
                fontSize: '11px',
                color: 'var(--ink-40)',
                marginTop: '4px',
              }}
            >
              {video.channelTitle}
            </div>
          </div>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ff4444', flexShrink: 0 }} aria-hidden>smart_display</span>
        </a>
      ))}
    </div>
  );
}

function MessageContent({
  content,
  chatNotebookId,
  setNotebookMap,
}: {
  content: string;
  chatNotebookId: string | null;
  setNotebookMap: Map<string, string | null>;
}) {
  const hasSetMarkers = content.includes('[flashcard_set:') || content.includes('[quiz_set:');
  const hasMindmap = content.includes('[mindmap_start:');
  const hasPresentation = content.includes('[presentation_start:');
  const hasYouTubeVideos = content.includes('[youtube_videos_start:');

  if (!hasSetMarkers && !hasMindmap && !hasPresentation && !hasYouTubeVideos) {
    return <MarkdownRenderer content={content} />;
  }

  const parts: React.ReactNode[] = [];
  const remaining = content;
  let partKey = 0;

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

  for (const segment of segments) {
    if (segment.type === 'mindmap') {
      // MindmapRenderer expects a notebookId; for cross-notebook chats we
      // fall back to an empty string. Downstream code (mindmap save/share)
      // ignores it when not present.
      parts.push(
        <MindmapRenderer
          key={`mindmap-${partKey++}`}
          title={segment.title!}
          markdown={segment.value}
          notebookId={chatNotebookId ?? ''}
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

      // Resolve the notebook that hosts this set: prefer the chat's primary
      // notebook, otherwise look it up in the per-set map. If still unknown,
      // skip the link (render placeholder text) — this only happens until the
      // set-list fetch completes.
      const resolvedNotebookId = chatNotebookId ?? setNotebookMap.get(setId) ?? null;

      if (!resolvedNotebookId) {
        parts.push(
          <span
            key={`${markerType}-${partKey++}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              margin: '6px 0',
              borderRadius: '10px',
              background: isQuiz ? 'rgba(81,112,255,0.1)' : 'rgba(140,82,255,0.1)',
              border: `1px solid ${isQuiz ? 'rgba(81,112,255,0.18)' : 'rgba(140,82,255,0.18)'}`,
              color: isQuiz ? 'var(--secondary-dim)' : 'var(--md-h3)',
              fontSize: '13px',
              fontWeight: 600,
              opacity: 0.7,
              fontFamily: 'var(--font-chat)',
            }}
          >
            {isQuiz ? <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>help</span> : <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>layers</span>}
            {isQuiz ? 'Quiz' : 'Flashcards'}
          </span>
        );
      } else {
        parts.push(
          <Link
            key={`${markerType}-${partKey++}`}
            href={
              isQuiz
                ? `/notebooks/${resolvedNotebookId}/quizzes/${setId}`
                : `/notebooks/${resolvedNotebookId}/flashcards/${setId}`
            }
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              margin: '6px 0',
              borderRadius: '10px',
              background: isQuiz ? 'rgba(81,112,255,0.2)' : 'rgba(140,82,255,0.2)',
              border: `1px solid ${isQuiz ? 'rgba(81,112,255,0.3)' : 'rgba(140,82,255,0.3)'}`,
              color: isQuiz ? 'var(--secondary-dim)' : 'var(--md-h3)',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = isQuiz
                ? 'rgba(81,112,255,0.3)'
                : 'rgba(140,82,255,0.3)';
              (e.currentTarget as HTMLAnchorElement).style.borderColor = isQuiz
                ? 'rgba(81,112,255,0.5)'
                : 'rgba(140,82,255,0.5)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.background = isQuiz
                ? 'rgba(81,112,255,0.2)'
                : 'rgba(140,82,255,0.2)';
              (e.currentTarget as HTMLAnchorElement).style.borderColor = isQuiz
                ? 'rgba(81,112,255,0.3)'
                : 'rgba(140,82,255,0.3)';
            }}
          >
            {isQuiz ? <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>help</span> : <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>layers</span>}
            {isQuiz ? 'Open Quiz' : 'Open Flashcards'}
          </Link>
        );
      }

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
