'use client';

import { useState, useEffect, useCallback } from 'react';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  bg: '#0d0d1a',
  surface: '#151528',
  cardBg: '#1a1a30',
  primary: '#8c52ff',
  secondary: '#ffde59',
  textPrimary: '#ede9ff',
  textSecondary: '#c4b8ff',
  textMuted: 'rgba(237,233,255,0.4)',
  borderSubtle: 'rgba(140,82,255,0.12)',
  success: '#48db9c',
  error: '#ff6b6b',
} as const;

interface UserNotebook {
  id: string;
  name: string;
  subject: string | null;
  color: string;
  alreadyShared: boolean;
}

interface PublishNotebookModalProps {
  open: boolean;
  onClose: () => void;
  onPublished?: () => void;
}

export default function PublishNotebookModal({ open, onClose, onPublished }: PublishNotebookModalProps) {
  const [notebooks, setNotebooks] = useState<UserNotebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hoveredNotebook, setHoveredNotebook] = useState<string | null>(null);
  const [hoveredPublish, setHoveredPublish] = useState(false);
  const [hoveredCancel, setHoveredCancel] = useState(false);

  const fetchNotebooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch user's notebooks
      const nbRes = await fetch('/api/notebooks?limit=50&sort=updatedAt');
      if (!nbRes.ok) throw new Error('Failed to fetch notebooks');
      const nbJson = await nbRes.json();
      const rawNotebooks = nbJson.data?.notebooks || nbJson.notebooks || (Array.isArray(nbJson.data) ? nbJson.data : []);

      // Fetch already-shared notebooks
      const shareRes = await fetch('/api/community/notebooks?filter=mine&limit=50');
      const sharedIds = new Set<string>();
      if (shareRes.ok) {
        const shareJson = await shareRes.json();
        const shared = shareJson.data?.notebooks || [];
        for (const s of shared) {
          if (s.notebookId) sharedIds.add(s.notebookId);
        }
      }

      const mapped: UserNotebook[] = rawNotebooks.map(
        (nb: { id: string; name: string; subject?: string | null; color?: string }) => ({
          id: nb.id,
          name: nb.name || 'Untitled',
          subject: nb.subject || null,
          color: nb.color || '#8c52ff',
          alreadyShared: sharedIds.has(nb.id),
        })
      );
      setNotebooks(mapped);
    } catch {
      setError('Failed to load notebooks');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      fetchNotebooks();
      setSelectedId(null);
      setSuccess(false);
      setError(null);
      setPublishing(false);
    }
  }, [open, fetchNotebooks]);

  const handlePublish = async () => {
    if (!selectedId || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/notebooks/${selectedId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'copy', visibility }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to publish');
      }
      setSuccess(true);
      onPublished?.();
      // Auto-close after a moment
      setTimeout(() => onClose(), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    }
    setPublishing(false);
  };

  if (!open) return null;

  const availableNotebooks = notebooks.filter((nb) => !nb.alreadyShared);
  const sharedNotebooks = notebooks.filter((nb) => nb.alreadyShared);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 9998,
        }}
      />
      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 480,
          maxWidth: '90vw',
          maxHeight: '80vh',
          background: COLORS.surface,
          borderRadius: 16,
          border: `1px solid ${COLORS.borderSubtle}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: `1px solid ${COLORS.borderSubtle}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
              Publish to Community
            </h2>
            <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '4px 0 0' }}>
              Choose a notebook to share with everyone
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.textMuted,
              cursor: 'pointer',
              padding: 4,
              borderRadius: 8,
              display: 'flex',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
          {/* Success state */}
          {success && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 48, color: COLORS.success, display: 'block', marginBottom: 12 }}
              >
                check_circle
              </span>
              <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
                Published!
              </div>
              <div style={{ fontSize: 13, color: COLORS.textMuted }}>
                Your notebook is now live in the community.
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && !success && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: 56,
                    borderRadius: 10,
                    background: 'rgba(140,82,255,0.06)',
                    animation: `publishPulse 1.5s ease-in-out infinite ${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Error */}
          {error && !success && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,107,107,0.08)',
                border: '1px solid rgba(255,107,107,0.2)',
                color: COLORS.error,
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {/* Notebook list */}
          {!loading && !success && (
            <>
              {/* Visibility toggle */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Visibility
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['public', 'friends'] as const).map((v) => {
                    const active = visibility === v;
                    return (
                      <button
                        key={v}
                        onClick={() => setVisibility(v)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: `1px solid ${active ? COLORS.primary : COLORS.borderSubtle}`,
                          background: active ? 'rgba(140,82,255,0.12)' : 'transparent',
                          color: active ? COLORS.textSecondary : COLORS.textMuted,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: `all 0.15s ${EASING}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          {v === 'public' ? 'public' : 'group'}
                        </span>
                        {v === 'public' ? 'Everyone' : 'Friends Only'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Select notebook */}
              <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Select a Notebook
              </div>

              {availableNotebooks.length === 0 && sharedNotebooks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: COLORS.textMuted, fontSize: 13 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: 0.4 }}>
                    menu_book
                  </span>
                  No notebooks yet. Create one first!
                </div>
              )}

              {availableNotebooks.length === 0 && sharedNotebooks.length > 0 && (
                <div style={{ textAlign: 'center', padding: '24px 16px', color: COLORS.textMuted, fontSize: 13, marginBottom: 12 }}>
                  All your notebooks are already published!
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {availableNotebooks.map((nb) => {
                  const selected = selectedId === nb.id;
                  const hovered = hoveredNotebook === nb.id;
                  return (
                    <button
                      key={nb.id}
                      onClick={() => setSelectedId(nb.id)}
                      onMouseEnter={() => setHoveredNotebook(nb.id)}
                      onMouseLeave={() => setHoveredNotebook(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: `1.5px solid ${selected ? COLORS.primary : hovered ? 'rgba(140,82,255,0.3)' : COLORS.borderSubtle}`,
                        background: selected ? 'rgba(140,82,255,0.1)' : hovered ? 'rgba(140,82,255,0.04)' : 'transparent',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: `all 0.15s ${EASING}`,
                        width: '100%',
                      }}
                    >
                      {/* Color dot */}
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: nb.color,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: COLORS.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {nb.name}
                        </div>
                        {nb.subject && (
                          <div style={{ fontSize: 11, color: COLORS.textMuted }}>
                            {nb.subject}
                          </div>
                        )}
                      </div>
                      {/* Check icon */}
                      {selected && (
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: COLORS.primary }}>
                          check_circle
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Already shared section */}
              {sharedNotebooks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Already Published
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {sharedNotebooks.map((nb) => (
                      <div
                        key={nb.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '8px 14px',
                          borderRadius: 10,
                          background: 'rgba(72,219,156,0.04)',
                          border: `1px solid rgba(72,219,156,0.12)`,
                          opacity: 0.6,
                        }}
                      >
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: nb.color, flexShrink: 0 }} />
                        <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {nb.name}
                        </div>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: COLORS.success }}>
                          check
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && !loading && (
          <div
            style={{
              padding: '14px 24px 18px',
              borderTop: `1px solid ${COLORS.borderSubtle}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button
              onClick={onClose}
              onMouseEnter={() => setHoveredCancel(true)}
              onMouseLeave={() => setHoveredCancel(false)}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: `1px solid ${COLORS.borderSubtle}`,
                background: hoveredCancel ? 'rgba(140,82,255,0.06)' : 'transparent',
                color: COLORS.textMuted,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `all 0.15s ${EASING}`,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handlePublish}
              disabled={!selectedId || publishing}
              onMouseEnter={() => setHoveredPublish(true)}
              onMouseLeave={() => setHoveredPublish(false)}
              style={{
                padding: '8px 22px',
                borderRadius: 8,
                border: 'none',
                background: !selectedId ? 'rgba(140,82,255,0.2)' : hoveredPublish ? '#9d6aff' : COLORS.primary,
                color: !selectedId ? 'rgba(237,233,255,0.3)' : '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: selectedId ? 'pointer' : 'not-allowed',
                transition: `all 0.15s ${EASING}`,
                transform: hoveredPublish && selectedId ? 'translateY(-1px)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: publishing ? 0.7 : 1,
              }}
            >
              {publishing ? (
                <>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 16, animation: 'publishSpin 0.8s linear infinite' }}
                  >
                    progress_activity
                  </span>
                  Publishing…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>publish</span>
                  Publish
                </>
              )}
            </button>
          </div>
        )}

        <style>{`
          @keyframes publishPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @keyframes publishSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </>
  );
}
