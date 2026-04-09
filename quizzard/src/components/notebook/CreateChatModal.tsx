'use client';

import { useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { X, Upload, BookOpen, Check, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getMageName } from '@/lib/scholar';

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
interface DocRef {
  id: string;
  fileName: string;
  fileSize: number;
}

interface Props {
  notebookId: string;
  notebookName: string;
  sections: SectionRef[];
  documents: DocRef[];
  onClose: () => void;
  onCreate: (chatId: string) => void;
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

export default function CreateChatModal({
  notebookId,
  notebookName,
  sections,
  documents,
  onClose,
  onCreate,
}: Props) {
  const { upload } = useDirectUpload();
  const { isPhone } = useBreakpoint();
  const { data: session } = useSession();
  const mageName = getMageName(session?.user?.scholarName);
  const [title, setTitle] = useState('');
  const [activeTab, setActiveTab] = useState<'notebook' | 'upload'>('notebook');
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [uploadedDocIds, setUploadedDocIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const togglePage = (id: string) => {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const uploadFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setUploadError('Unsupported file type. Allowed: PDF, DOCX, TXT, MD');
        return;
      }
      setUploadError(null);
      setIsUploading(true);
      try {
        const { storagePath } = await upload(file, 'document', { notebookId });
        const res = await fetch(`/api/notebooks/${notebookId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath, fileName: file.name, fileType: file.type }),
        });
        const json = await res.json();
        if (json.success && json.data?.id) {
          setUploadedDocIds((prev) => [...prev, json.data.id]);
          setSelectedDocIds((prev) => new Set([...prev, json.data.id]));
        }
      } finally {
        setIsUploading(false);
      }
    },
    [notebookId, upload]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleCreate = async () => {
    const chatTitle =
      title.trim() ||
      `Chat — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    setIsCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: chatTitle,
          contextPageIds: [...selectedPageIds],
          contextDocIds: [...selectedDocIds],
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        onCreate(json.data.id);
      } else {
        setCreateError(json.error ?? 'Failed to create chat. Please try again.');
      }
    } catch (err) {
      console.error('[CreateChatModal] Failed to create chat:', err);
      setCreateError('Network error. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const totalContext = selectedPageIds.size + selectedDocIds.size;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: isPhone ? 0 : '50%',
          left: isPhone ? 0 : '50%',
          transform: isPhone ? 'none' : 'translate(-50%, -50%)',
          zIndex: 1001,
          width: isPhone ? '100vw' : '540px',
          height: isPhone ? '100dvh' : undefined,
          maxWidth: isPhone ? 'none' : 'calc(100vw - 40px)',
          maxHeight: isPhone ? 'none' : undefined,
          background: 'linear-gradient(160deg, #1a1a36 0%, #151530 100%)',
          border: isPhone ? 'none' : '1px solid rgba(140,82,255,0.2)',
          borderRadius: isPhone ? 0 : '20px',
          boxShadow: isPhone ? 'none' : '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07) inset',
          fontFamily: 'inherit',
          overflow: isPhone ? 'auto' : 'hidden',
          margin: isPhone ? 0 : undefined,
          display: isPhone ? 'flex' : undefined,
          flexDirection: isPhone ? 'column' : undefined,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isPhone ? '16px 16px 14px' : '22px 24px 18px',
            borderBottom: '1px solid rgba(140,82,255,0.1)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '7px',
                  background:
                    'linear-gradient(135deg, rgba(140,82,255,0.5), rgba(81,112,255,0.35))',
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
              <h2
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 700,
                  color: '#ede9ff',
                  letterSpacing: '-0.01em',
                }}
              >
                New {mageName} Chat
              </h2>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'rgba(185,195,255,0.6)' }}>
              in <span style={{ color: 'rgba(185,195,255,0.7)' }}>{notebookName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: 'none',
              background: 'rgba(255,255,255,0.07)',
              color: 'rgba(237,233,255,0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
              (e.currentTarget as HTMLButtonElement).style.color = '#ede9ff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,233,255,0.4)';
            }}
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            padding: isPhone ? '16px 16px 20px' : '20px 24px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: isPhone ? '16px' : '20px',
            flex: isPhone ? 1 : undefined,
          }}
        >
          {/* Title input */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: 'rgba(185,195,255,0.5)',
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              Chat Name
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Chat — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(140,82,255,0.2)',
                borderRadius: '10px',
                padding: '10px 14px',
                fontSize: '14px',
                color: '#ede9ff',
                outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => {
                (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(140,82,255,0.5)';
              }}
              onBlur={(e) => {
                (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(140,82,255,0.2)';
              }}
            />
          </div>

          {/* Feed the Mage section */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'rgba(185,195,255,0.5)',
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                }}
              >
                Feed {mageName}
              </label>
              {totalContext > 0 && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    background: 'rgba(140,82,255,0.2)',
                    border: '1px solid rgba(140,82,255,0.3)',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#ae89ff',
                    letterSpacing: '0.04em',
                  }}
                >
                  {totalContext} selected
                </span>
              )}
            </div>

            {/* Tabs */}
            <div
              style={{
                display: 'flex',
                gap: '4px',
                marginBottom: '12px',
                background: 'rgba(255,255,255,0.07)',
                borderRadius: '10px',
                padding: '4px',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {(['notebook', 'upload'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: activeTab === tab ? 'rgba(140,82,255,0.2)' : 'transparent',
                    color: activeTab === tab ? '#c4a9ff' : 'rgba(185,195,255,0.5)',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                >
                  {tab === 'notebook' ? <BookOpen size={12} /> : <Upload size={12} />}
                  {tab === 'notebook' ? 'From Notebook' : 'Upload File'}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === 'notebook' ? (
              <div
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  maxHeight: '200px',
                  overflowY: 'auto',
                }}
              >
                {sections.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center' }}>
                    <p style={{ fontSize: '13px', color: 'rgba(185,195,255,0.6)', margin: 0 }}>
                      No sections yet. Add pages to your notebook first.
                    </p>
                  </div>
                ) : (
                  sections.map((section) => (
                    <SectionPickerItem
                      key={section.id}
                      section={section}
                      selectedPageIds={selectedPageIds}
                      onTogglePage={togglePage}
                      depth={0}
                    />
                  ))
                )}
              </div>
            ) : (
              <div>
                {/* Upload zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    borderRadius: '10px',
                    border: `2px dashed ${isDragging ? 'rgba(140,82,255,0.7)' : 'rgba(70,69,96,0.4)'}`,
                    background: isDragging ? 'rgba(140,82,255,0.05)' : 'rgba(255,255,255,0.035)',
                    padding: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                    marginBottom: uploadedDocIds.length > 0 ? '10px' : 0,
                  }}
                  onMouseEnter={(e) => {
                    if (!isDragging)
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        'rgba(140,82,255,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isDragging)
                      (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(70,69,96,0.4)';
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
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
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
                        size={18}
                        style={{ color: '#ae89ff', animation: 'spin 0.8s linear infinite' }}
                      />
                    ) : (
                      <Upload size={18} style={{ color: '#ae89ff' }} />
                    )}
                  </div>
                  <div>
                    <p
                      style={{
                        margin: '0 0 2px',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#e5e3ff',
                      }}
                    >
                      {isUploading ? 'Uploading…' : 'Drop file or click to browse'}
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#8888a8' }}>
                      PDF · DOCX · TXT · MD — max 50MB
                    </p>
                    {uploadError && (
                      <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#fd6f85' }}>
                        {uploadError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Existing documents to select */}
                {documents.length > 0 && (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.025)',
                      borderRadius: '10px',
                      border: '1px solid rgba(255,255,255,0.06)',
                      maxHeight: '140px',
                      overflowY: 'auto',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 12px 4px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: 'rgba(185,195,255,0.5)',
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
                          onClick={() => toggleDoc(doc.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(140,82,255,0.08)' : 'transparent',
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
                              fontSize: '12px',
                              color: 'rgba(237,233,255,0.7)',
                              flex: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {doc.fileName}
                          </span>
                          <span style={{ fontSize: '10px', color: '#8888a8', flexShrink: 0 }}>
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

          {/* Error */}
          {createError && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(253,111,133,0.08)',
                border: '1px solid rgba(253,111,133,0.25)',
                fontSize: '12px',
                color: '#fd6f85',
                fontWeight: 500,
              }}
            >
              {createError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'transparent',
                color: 'rgba(185,195,255,0.5)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
                (e.currentTarget as HTMLButtonElement).style.color = '#ede9ff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(185,195,255,0.5)';
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                background: isCreating
                  ? 'rgba(140,82,255,0.4)'
                  : 'linear-gradient(135deg, #8c52ff, #5170ff)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: isCreating ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: isCreating ? 'none' : '0 4px 16px rgba(140,82,255,0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                transition: 'opacity 0.15s, transform 0.15s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                if (!isCreating)
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              {isCreating ? (
                <>
                  <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Creating…
                </>
              ) : (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}
                  >
                    auto_fix_high
                  </span>{' '}
                  Start Chat
                </>
              )}
            </button>
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  );
}

// ── Section picker tree item ──────────────────────────────────────────────
function SectionPickerItem({
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
  const hasPages = section.pages.length > 0;
  const hasChildren = (section.children?.length ?? 0) > 0;

  return (
    <div>
      {/* Section header */}
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
        <span style={{ color: 'rgba(185,195,255,0.6)', display: 'flex' }}>
          {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'rgba(185,195,255,0.6)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flex: 1,
          }}
        >
          {section.title}
        </span>
        {hasPages && (
          <span style={{ fontSize: '10px', color: 'rgba(185,195,255,0.38)' }}>
            {section.pages.filter((p) => selectedPageIds.has(p.id)).length}/{section.pages.length}
          </span>
        )}
      </div>

      {/* Pages */}
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
                onMouseEnter={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.07)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent';
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
                    fontSize: '12px',
                    color: isSelected ? '#ede9ff' : 'rgba(237,233,255,0.6)',
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

          {/* Recursive children */}
          {section.children?.map((child) => (
            <SectionPickerItem
              key={child.id}
              section={child}
              selectedPageIds={selectedPageIds}
              onTogglePage={onTogglePage}
              depth={depth + 1}
            />
          ))}

          {!hasPages && !hasChildren && (
            <div style={{ padding: `6px 12px 6px ${24 + depth * 14}px` }}>
              <span style={{ fontSize: '11px', color: 'rgba(185,195,255,0.32)' }}>No pages</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
