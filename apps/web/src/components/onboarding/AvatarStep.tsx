'use client';

import { useEffect, useRef, useState } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { validateFile } from '@/lib/file-validation';

interface AvatarStepProps {
  username: string;
  currentAvatarUrl: string | null;
  onAvatarChange: (url: string) => void;
  /** Lifts upload-busy state so the shell can disable its CTA mid-upload. */
  onUploadingChange?: (busy: boolean) => void;
}

export default function AvatarStep({
  username,
  currentAvatarUrl,
  onAvatarChange,
  onUploadingChange,
}: AvatarStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading: isDirectUploading } = useDirectUpload();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadCardHovered, setUploadCardHovered] = useState(false);

  const isUploadBusy = uploading || isDirectUploading;

  useEffect(() => {
    onUploadingChange?.(isUploadBusy);
  }, [isUploadBusy, onUploadingChange]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const validationError = validateFile(file, 'avatar');
      if (validationError) {
        setUploadError(validationError);
        setUploading(false);
        return;
      }
      const { storagePath } = await upload(file, 'avatar');
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath }),
      });
      const json = await res.json();
      if (!res.ok) {
        setUploadError(json.error || 'Upload failed');
      } else {
        onAvatarChange(json.data?.avatarUrl || json.avatarUrl || json.url || '');
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const firstLetter = username ? username[0].toUpperCase() : '?';

  const cardBase: React.CSSProperties = {
    flex: 1,
    background: 'var(--surface-container-high)',
    borderRadius: '18px',
    padding: '14px 14px',
    border: '1px solid #555578',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
    position: 'relative',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {uploadError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '12px',
            background: 'rgba(253,111,133,0.12)',
            color: '#fd6f85',
            fontSize: '13px',
          }}
        >
          {uploadError}
        </div>
      )}

      {/* Avatar Preview */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: '96px',
            height: '96px',
            borderRadius: '50%',
            overflow: 'hidden',
            background: '#ae89ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 4px rgba(174,137,255,0.2), 0 8px 32px rgba(174,137,255,0.2)',
            position: 'relative',
          }}
        >
          {currentAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentAvatarUrl}
              alt="Avatar preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: '40px',
                color: '#fff',
                lineHeight: 1,
                userSelect: 'none',
              }}
            >
              {firstLetter}
            </span>
          )}
          {uploading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '28px', color: '#ae89ff', animation: 'spin 1s linear infinite' }}
              >
                progress_activity
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Option Cards */}
      <div style={{ display: 'flex', gap: '14px' }}>
        {/* Upload Card */}
        <div
          style={{
            ...cardBase,
            borderColor: uploadCardHovered ? 'rgba(174,137,255,0.4)' : '#555578',
          }}
          onMouseEnter={() => setUploadCardHovered(true)}
          onMouseLeave={() => setUploadCardHovered(false)}
          onClick={() => !isUploadBusy && fileInputRef.current?.click()}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#ae89ff' }}>
            photo_camera
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface)', textAlign: 'center' }}>
            Upload Photo
          </span>
          {uploading && (
            <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>Uploading…</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        {/* Create Avatar Card */}
        <div style={{ ...cardBase, opacity: 0.4, pointerEvents: 'none', cursor: 'default' }}>
          {/* Coming Soon badge */}
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              background: '#ae89ff',
              color: '#2a0066',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '20px',
              lineHeight: '1.6',
            }}
          >
            Soon
          </div>
          <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#ae89ff' }}>
            face
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--on-surface)', textAlign: 'center' }}>
            Create Avatar
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes obSpinnerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="spin 1s"] { animation: obSpinnerPulse 1.2s ease-in-out infinite !important; }
        }
      `}</style>
    </div>
  );
}
