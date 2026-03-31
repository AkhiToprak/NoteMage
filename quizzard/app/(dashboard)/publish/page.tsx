'use client';

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import TagInput from '@/components/publish/TagInput';

const PublishRichEditor = lazy(() => import('@/components/publish/PublishRichEditor'));

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#8c52ff',
  primaryLight: '#ae89ff',
  secondary: '#ffde59',
  textPrimary: '#ede9ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
  borderSubtle: '#2a2a44',
  success: '#4ade80',
  error: '#fd6f85',
} as const;

interface Notebook {
  id: string;
  name: string;
  subject?: string | null;
  color?: string | null;
  sectionCount: number;
}

const STEPS = [
  { label: 'Notebook', icon: 'auto_stories' },
  { label: 'Visibility', icon: 'visibility' },
  { label: 'Title', icon: 'title' },
  { label: 'Content', icon: 'edit_note' },
  { label: 'Tags', icon: 'sell' },
  { label: 'Review', icon: 'check_circle' },
];

export default function PublishPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loadingNotebooks, setLoadingNotebooks] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  // Form state
  const [selectedNotebook, setSelectedNotebook] = useState<Notebook | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'friends'>('public');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [coverImage, setCoverImage] = useState<{ file: File; url: string } | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Hover states
  const [hoveredNotebook, setHoveredNotebook] = useState<string | null>(null);
  const [hoveredVis, setHoveredVis] = useState<string | null>(null);

  const fetchNotebooks = useCallback(async () => {
    try {
      const res = await fetch('/api/notebooks');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const nbs = (Array.isArray(json.data) ? json.data : json.data.notebooks || []) as Array<{
            id: string; name: string; subject?: string | null; color?: string | null;
            _count?: { sections?: number };
          }>;
          setNotebooks(nbs.map((n) => ({
            id: n.id,
            name: n.name,
            subject: n.subject,
            color: n.color,
            sectionCount: n._count?.sections || 0,
          })));
        }
      }
    } catch {
      // ignore
    }
    setLoadingNotebooks(false);
  }, []);

  useEffect(() => { fetchNotebooks(); }, [fetchNotebooks]);

  // Cleanup cover image object URL on unmount
  useEffect(() => {
    return () => {
      if (coverImage) URL.revokeObjectURL(coverImage.url);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return !!selectedNotebook;
      case 1: return true;
      case 2: return title.trim().length > 0;
      case 3: return true; // content optional
      case 4: return tags.length >= 1;
      case 5: return true;
      default: return false;
    }
  };

  const handleCoverImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) return;

    if (coverImage) URL.revokeObjectURL(coverImage.url);
    setCoverImage({ file, url: URL.createObjectURL(file) });
    e.target.value = '';
  };

  const handleRemoveCover = () => {
    if (coverImage) {
      URL.revokeObjectURL(coverImage.url);
      setCoverImage(null);
    }
  };

  const handlePublish = async () => {
    if (!selectedNotebook) return;
    setPublishing(true);
    setPublishError('');

    try {
      // 1. Create the shared notebook
      const res = await fetch(`/api/notebooks/${selectedNotebook.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'copy',
          visibility,
          title: title.trim(),
          content: content.trim() || undefined,
          tags,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setPublishError(json.error || 'Failed to publish notebook');
        return;
      }

      const shareId = json.data?.share?.id || json.data?.shareId || json.data?.id;

      // 2. Upload cover image if any
      if (shareId && coverImage) {
        const formData = new FormData();
        formData.append('file', coverImage.file);
        formData.append('isCover', 'true');
        await fetch(`/api/community/notebooks/${shareId}/images`, {
          method: 'POST',
          body: formData,
        });
      }

      // Success — redirect to community
      router.push('/home');
    } catch {
      setPublishError('Something went wrong. Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0: return renderStepNotebook();
      case 1: return renderStepVisibility();
      case 2: return renderStepTitle();
      case 3: return renderStepContent();
      case 4: return renderStepTags();
      case 5: return renderStepReview();
      default: return null;
    }
  };

  const renderStepNotebook = () => (
    <div>
      <h2 style={stepTitleStyle}>Choose a Notebook</h2>
      <p style={stepDescStyle}>Select which notebook you want to publish to the community.</p>

      {loadingNotebooks ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 100, borderRadius: 14, background: COLORS.elevated, animation: 'publishPulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : notebooks.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: COLORS.textMuted }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, display: 'block', marginBottom: 8, opacity: 0.4 }}>
            library_books
          </span>
          No notebooks found. Create one first!
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {notebooks.map((nb) => {
            const isSelected = selectedNotebook?.id === nb.id;
            const isHovered = hoveredNotebook === nb.id;
            return (
              <button
                key={nb.id}
                onClick={() => { setSelectedNotebook(nb); if (!title) setTitle(nb.name); }}
                onMouseEnter={() => setHoveredNotebook(nb.id)}
                onMouseLeave={() => setHoveredNotebook(null)}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: `2px solid ${isSelected ? COLORS.primary : isHovered ? COLORS.borderSubtle : 'transparent'}`,
                  background: isSelected ? 'rgba(140,82,255,0.1)' : COLORS.elevated,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: `border-color 0.15s ${EASING}, transform 0.15s ${EASING}`,
                  transform: isHovered ? 'translateY(-1px)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: nb.color ? `${nb.color}33` : 'rgba(140,82,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: nb.color || COLORS.primaryLight }}>
                      auto_stories
                    </span>
                  </div>
                  {isSelected && (
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: COLORS.primary, marginLeft: 'auto' }}>
                      check_circle
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {nb.name}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                  {nb.subject || 'No subject'} · {nb.sectionCount} section{nb.sectionCount !== 1 ? 's' : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStepVisibility = () => {
    const options = [
      { key: 'public' as const, icon: 'public', label: 'Public', desc: 'Visible to everyone in the community' },
      { key: 'friends' as const, icon: 'group', label: 'Friends Only', desc: 'Only visible to your accepted friends' },
    ];
    return (
      <div>
        <h2 style={stepTitleStyle}>Choose Visibility</h2>
        <p style={stepDescStyle}>Who should be able to see your published notebook?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
          {options.map((opt) => {
            const isSelected = visibility === opt.key;
            const isHovered = hoveredVis === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setVisibility(opt.key)}
                onMouseEnter={() => setHoveredVis(opt.key)}
                onMouseLeave={() => setHoveredVis(null)}
                style={{
                  padding: 20,
                  borderRadius: 14,
                  border: `2px solid ${isSelected ? COLORS.primary : isHovered ? COLORS.borderSubtle : 'transparent'}`,
                  background: isSelected ? 'rgba(140,82,255,0.1)' : COLORS.elevated,
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  transition: `border-color 0.15s ${EASING}`,
                  fontFamily: 'inherit',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24, color: isSelected ? COLORS.primaryLight : COLORS.textMuted }}>
                  {opt.icon}
                </span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{opt.desc}</div>
                </div>
                {isSelected && (
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: COLORS.primary, marginLeft: 'auto' }}>
                    check_circle
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderStepTitle = () => (
    <div>
      <h2 style={stepTitleStyle}>Publication Title</h2>
      <p style={stepDescStyle}>Give your publication a catchy title.</p>
      <div style={{ maxWidth: 500 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          placeholder="e.g. Complete Guide to React Hooks"
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 12,
            border: `1px solid ${COLORS.borderSubtle}`,
            background: COLORS.elevated,
            color: COLORS.textPrimary,
            fontSize: 16,
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ textAlign: 'right', marginTop: 6, fontSize: 12, color: title.length >= 190 ? COLORS.error : COLORS.textMuted }}>
          {title.length}/200
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => (
    <div>
      <h2 style={stepTitleStyle}>Content <span style={{ fontSize: 14, fontWeight: 400, color: COLORS.textMuted }}>(optional)</span></h2>
      <p style={stepDescStyle}>Write a description with text, images, code blocks, and more. You can also add a cover image.</p>

      {/* Cover image */}
      <div style={{ maxWidth: 700, marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>
          Cover Image
        </label>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleCoverImageSelect}
          style={{ display: 'none' }}
        />
        {coverImage ? (
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: `1px solid ${COLORS.borderSubtle}` }}>
            <img
              src={coverImage.url}
              alt="Cover"
              style={{ width: '100%', maxHeight: 280, objectFit: 'cover', display: 'block' }}
            />
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
              <button
                onClick={() => coverInputRef.current?.click()}
                style={{
                  padding: '6px 12px', borderRadius: 8, border: 'none',
                  background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  fontFamily: 'inherit',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>swap_horiz</span>
                Replace
              </button>
              <button
                onClick={handleRemoveCover}
                style={{
                  padding: '6px 10px', borderRadius: 8, border: 'none',
                  background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: 14,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => coverInputRef.current?.click()}
            style={{
              width: '100%',
              padding: '28px 20px',
              borderRadius: 12,
              border: `1px dashed ${COLORS.borderSubtle}`,
              background: 'transparent',
              color: COLORS.textMuted,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              transition: `border-color 0.15s ${EASING}, color 0.15s ${EASING}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.primaryLight; e.currentTarget.style.color = COLORS.primaryLight; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderSubtle; e.currentTarget.style.color = COLORS.textMuted; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add_photo_alternate</span>
            Add a cover image
          </button>
        )}
      </div>

      {/* Rich editor with inline images */}
      <div style={{ maxWidth: 700 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>
          Description
        </label>
        <Suspense fallback={
          <div style={{ height: 300, borderRadius: 12, background: COLORS.elevated, animation: 'publishPulse 1.5s ease-in-out infinite' }} />
        }>
          <PublishRichEditor content={content} onChange={setContent} />
        </Suspense>
      </div>
    </div>
  );

  const renderStepTags = () => (
    <div>
      <h2 style={stepTitleStyle}>Add Tags</h2>
      <p style={stepDescStyle}>At least one tag is required. Tags help others discover your notebook.</p>
      <div style={{ maxWidth: 500 }}>
        <TagInput
          tags={tags}
          onChange={setTags}
          maxTags={15}
        />
      </div>
    </div>
  );

  const renderStepReview = () => (
    <div>
      <h2 style={stepTitleStyle}>Review & Publish</h2>
      <p style={stepDescStyle}>Double-check everything before publishing.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 500 }}>
        <ReviewRow label="Notebook" value={selectedNotebook?.name || '—'} />
        <ReviewRow label="Visibility" value={visibility === 'public' ? 'Public' : 'Friends Only'} />
        <ReviewRow label="Title" value={title || '—'} />
        <ReviewRow label="Cover Image" value={coverImage ? coverImage.file.name : 'None'} />
        <ReviewRow label="Content" value={content && content !== '<p></p>' ? 'Added' : 'None'} />
        <ReviewRow label="Tags" value={tags.length > 0 ? tags.map((t) => `#${t}`).join(', ') : 'None'} />
      </div>

      {publishError && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(253,111,133,0.1)', color: COLORS.error, fontSize: 13 }}>
          {publishError}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 40 }}>
      <style>{`
        @keyframes publishPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <button
          onClick={() => router.back()}
          style={{
            border: 'none', background: COLORS.elevated, borderRadius: 10,
            padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            color: COLORS.textMuted, fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
          Publish Notebook
        </h1>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 36, overflowX: 'auto', paddingBottom: 4 }}>
        {STEPS.map((s, i) => {
          const isActive = i === step;
          const isCompleted = i < step;
          return (
            <button
              key={s.label}
              onClick={() => { if (i < step) setStep(i); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: 10,
                border: 'none',
                background: isActive ? 'rgba(140,82,255,0.15)' : isCompleted ? 'rgba(74,222,128,0.08)' : 'transparent',
                color: isActive ? COLORS.primaryLight : isCompleted ? COLORS.success : COLORS.textMuted,
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                cursor: i < step ? 'pointer' : 'default',
                transition: `background 0.15s ${EASING}`,
                whiteSpace: 'nowrap',
                fontFamily: 'inherit',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {isCompleted ? 'check_circle' : s.icon}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div style={{ minHeight: 300, marginBottom: 32 }}>
        {renderStep()}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          style={{
            padding: '12px 24px',
            borderRadius: 12,
            border: `1px solid ${COLORS.borderSubtle}`,
            background: 'transparent',
            color: step === 0 ? COLORS.textMuted : COLORS.textPrimary,
            fontSize: 14,
            fontWeight: 600,
            cursor: step === 0 ? 'not-allowed' : 'pointer',
            opacity: step === 0 ? 0.5 : 1,
            fontFamily: 'inherit',
          }}
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            style={{
              padding: '12px 28px',
              borderRadius: 12,
              border: 'none',
              background: canProceed() ? COLORS.primary : COLORS.elevated,
              color: canProceed() ? '#fff' : COLORS.textMuted,
              fontSize: 14,
              fontWeight: 700,
              cursor: canProceed() ? 'pointer' : 'not-allowed',
              transition: `background 0.15s ${EASING}, transform 0.15s ${EASING}`,
              fontFamily: 'inherit',
            }}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handlePublish}
            disabled={publishing || tags.length === 0}
            style={{
              padding: '12px 32px',
              borderRadius: 12,
              border: 'none',
              background: publishing ? COLORS.elevated : `linear-gradient(135deg, ${COLORS.primary}, #6c3ce6)`,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: publishing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'inherit',
            }}
          >
            {publishing ? (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                Publishing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>publish</span>
                Publish
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Shared styles ─── */
const stepTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: '#ede9ff',
  margin: '0 0 6px',
};

const stepDescStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#aaa8c8',
  margin: '0 0 20px',
  lineHeight: 1.5,
};

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '12px 16px', borderRadius: 10, background: '#232342',
    }}>
      <span style={{ fontSize: 13, color: '#8888a8', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#ede9ff', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}
