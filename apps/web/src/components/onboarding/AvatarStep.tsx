'use client';

import { useRef, useState } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { validateFile } from '@/lib/file-validation';

interface AvatarStepProps {
  username: string;
  currentAvatarUrl: string | null;
  onAvatarChange: (url: string) => void;
  onNext: () => void;
  onSkip: () => void;
  loading: boolean;
  error: string;
}

export default function AvatarStep({
  username,
  currentAvatarUrl,
  onAvatarChange,
  onNext,
  onSkip,
  loading,
  error,
}: AvatarStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading: isDirectUploading } = useDirectUpload();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadCardHovered, setUploadCardHovered] = useState(false);

  const isUploadBusy = uploading || isDirectUploading;

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
      // Reset file input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const displayError = error || uploadError;
  const firstLetter = username ? username[0].toUpperCase() : '?';

  const cardBase: React.CSSProperties = {
    flex: 1,
    background: '#2d2d52',
    borderRadius: '20px',
    padding: '20px 16px',
    border: '1px solid #555578',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
    position: 'relative',
  };

  return (
    <>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
          Choose your avatar
        </h2>
        <p style={{ fontSize: '14px', color: '#aaa8c8', margin: 0 }}>
          This is how the community will see you.
        </p>
      </div>

      {displayError && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'rgba(253,111,133,0.12)',
            color: '#fd6f85',
            fontSize: '14px',
            marginBottom: '20px',
          }}
        >
          {displayError}
        </div>
      )}

      {/* Avatar Preview */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
        <div
          style={{
            width: '120px',
            height: '120px',
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
                fontSize: '48px',
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
                background: 'rgba(26, 26, 54,0.7)',
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
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
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
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '28px', color: '#ae89ff' }}
          >
            photo_camera
          </span>
          <span
            style={{ fontSize: '13px', fontWeight: 600, color: '#e5e3ff', textAlign: 'center' }}
          >
            Upload Photo
          </span>
          {uploading && <span style={{ fontSize: '11px', color: '#aaa8c8' }}>uploading...</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>

        {/* Create Avatar Card */}
        <div
          style={{
            ...cardBase,
            opacity: 0.4,
            pointerEvents: 'none',
            cursor: 'default',
          }}
        >
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
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '28px', color: '#ae89ff' }}
          >
            face
          </span>
          <span
            style={{ fontSize: '13px', fontWeight: 600, color: '#e5e3ff', textAlign: 'center' }}
          >
            Create Avatar
          </span>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <button
          onClick={onNext}
          disabled={loading || isUploadBusy}
          style={{
            width: '100%',
            padding: '16px',
            background:
              loading || uploading
                ? '#555578'
                : 'linear-gradient(135deg, #ae89ff 0%, #884efb 100%)',
            border: 'none',
            borderRadius: '16px',
            color: loading || uploading ? '#aaa8c8' : '#2a0066',
            fontSize: '16px',
            fontWeight: 700,
            cursor: loading || uploading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading || uploading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onMouseEnter={(e) => {
            if (!loading && !uploading) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(174,137,255,0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading && !uploading) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(174,137,255,0.3)';
            }
          }}
          onMouseDown={(e) => {
            if (!loading && !uploading) e.currentTarget.style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            if (!loading && !uploading) e.currentTarget.style.transform = 'scale(1.02)';
          }}
        >
          Continue
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            arrow_forward
          </span>
        </button>

        <button
          onClick={onSkip}
          disabled={loading || isUploadBusy}
          style={{
            width: '100%',
            padding: '14px',
            background: 'transparent',
            border: 'none',
            borderRadius: '16px',
            color: '#8888a8',
            fontSize: '15px',
            fontWeight: 600,
            cursor: loading || uploading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'color 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            if (!loading && !uploading) e.currentTarget.style.color = '#aaa8c8';
          }}
          onMouseLeave={(e) => {
            if (!loading && !uploading) e.currentTarget.style.color = '#8888a8';
          }}
        >
          Skip for now
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
