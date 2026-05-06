'use client';

import { useState, useEffect, useRef, PointerEvent as ReactPointerEvent } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';

interface AvatarEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const EDITOR_SIZE = 280;
const OUTPUT_SIZE = 256;

export default function AvatarEditor({ open, onClose, onSaved }: AvatarEditorProps) {
  const { upload } = useDirectUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // When opened without an image loaded, trigger the file picker
  useEffect(() => {
    if (open && !image) {
      // Small delay so the modal renders first
      const t = setTimeout(() => fileInputRef.current?.click(), 50);
      return () => clearTimeout(t);
    }
  }, [open, image]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      // User cancelled the file picker — close if no image was loaded yet
      if (!image) onClose();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum size is 5MB.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setScale(1);
        setOffset({ x: 0, y: 0 });
      };
      img.onerror = () => setError('Could not load image.');
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Close on file picker cancel (input's cancel event)
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const handleCancel = () => {
      if (!image) onClose();
    };
    input.addEventListener('cancel', handleCancel);
    return () => input.removeEventListener('cancel', handleCancel);
  }, [image, onClose]);

  // Draw avatar preview on canvas
  useEffect(() => {
    if (!open || !image || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, EDITOR_SIZE, EDITOR_SIZE);

    ctx.fillStyle = '#0c0c1e';
    ctx.fillRect(0, 0, EDITOR_SIZE, EDITOR_SIZE);

    const imgAspect = image.width / image.height;
    let drawW: number, drawH: number;
    if (imgAspect > 1) {
      drawH = EDITOR_SIZE * scale;
      drawW = drawH * imgAspect;
    } else {
      drawW = EDITOR_SIZE * scale;
      drawH = drawW / imgAspect;
    }
    const drawX = (EDITOR_SIZE - drawW) / 2 + offset.x;
    const drawY = (EDITOR_SIZE - drawH) / 2 + offset.y;
    ctx.drawImage(image, drawX, drawY, drawW, drawH);

    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(EDITOR_SIZE / 2, EDITOR_SIZE / 2, EDITOR_SIZE / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.strokeStyle = '#ae89ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(EDITOR_SIZE / 2, EDITOR_SIZE / 2, EDITOR_SIZE / 2 - 8, 0, Math.PI * 2);
    ctx.stroke();
  }, [open, image, scale, offset]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const handleSave = async () => {
    if (!image) return;
    setUploading(true);
    setError('');

    const offscreen = document.createElement('canvas');
    offscreen.width = OUTPUT_SIZE;
    offscreen.height = OUTPUT_SIZE;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;

    const ratio = OUTPUT_SIZE / EDITOR_SIZE;
    const imgAspect = image.width / image.height;
    let drawW: number, drawH: number;
    if (imgAspect > 1) {
      drawH = EDITOR_SIZE * scale;
      drawW = drawH * imgAspect;
    } else {
      drawW = EDITOR_SIZE * scale;
      drawH = drawW / imgAspect;
    }
    const drawX = ((EDITOR_SIZE - drawW) / 2 + offset.x) * ratio;
    const drawY = ((EDITOR_SIZE - drawH) / 2 + offset.y) * ratio;

    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, drawX, drawY, drawW * ratio, drawH * ratio);

    offscreen.toBlob(async (blob) => {
      if (!blob) {
        setError('Failed to process image.');
        setUploading(false);
        return;
      }
      try {
        const file = new File([blob], 'avatar.png', { type: 'image/png' });
        const { storagePath } = await upload(file, 'avatar');
        const res = await fetch('/api/user/avatar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storagePath }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Upload failed.');
        } else {
          handleClose();
          onSaved();
        }
      } catch {
        setError('Upload failed. Please try again.');
      }
      setUploading(false);
    }, 'image/png');
  };

  const handleClose = () => {
    setImage(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setError('');
    onClose();
  };

  if (!open)
    return (
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      {image && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div
            style={{
              background: '#272746',
              borderRadius: '24px',
              padding: '32px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
              minWidth: '340px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#e5e3ff' }}>
              Adjust your photo
            </h3>

            <canvas
              ref={canvasRef}
              width={EDITOR_SIZE}
              height={EDITOR_SIZE}
              style={{
                width: `${EDITOR_SIZE}px`,
                height: `${EDITOR_SIZE}px`,
                borderRadius: '50%',
                cursor: dragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />

            {/* Scale slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
              <span
                className="material-symbols-outlined"
                style={{ color: '#aaa8c8', fontSize: '18px' }}
              >
                photo_size_select_small
              </span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.01"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: '#ae89ff', height: '6px' }}
              />
              <span
                className="material-symbols-outlined"
                style={{ color: '#aaa8c8', fontSize: '24px' }}
              >
                photo_size_select_large
              </span>
            </div>

            {error && <p style={{ color: '#ff6b6b', fontSize: '13px', margin: 0 }}>{error}</p>}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button
                onClick={handleClose}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid rgba(174,137,255,0.3)',
                  background: 'transparent',
                  color: '#aaa8c8',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(174,137,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={uploading}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  background: uploading
                    ? '#6b5a99'
                    : 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  transition: 'opacity 0.15s',
                }}
              >
                {uploading ? 'Uploading…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
