'use client';

import { useState, useRef } from 'react';
import { Upload, Loader } from 'lucide-react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { validateFile } from '@/lib/file-validation';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

interface FileUploadProps {
  notebookId: string;
  onUploadComplete: () => void;
}

export default function FileUpload({ notebookId, onUploadComplete }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload: directUpload, isUploading: isDirectUploading } = useDirectUpload();

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file, 'document');
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const { storagePath } = await directUpload(file, 'document', { notebookId });

      const res = await fetch(`/api/notebooks/${notebookId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storagePath, fileName: file.name, fileType: file.type }),
      });

      const json = await res.json();

      if (json.success) {
        onUploadComplete();
      } else {
        setError(json.error || 'Upload failed. Please try again.');
      }
    } catch {
      setError('Upload failed. Please check your connection and try again.');
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      {/* Drop zone */}
      <div
        onClick={() => !(isUploading || isDirectUploading) && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!(isUploading || isDirectUploading)) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: isDragging ? '2px solid #5170ff' : '2px dashed rgba(81,112,255,0.3)',
          borderRadius: '14px',
          padding: '28px 20px',
          background: isDragging ? 'rgba(81,112,255,0.06)' : 'rgba(81,112,255,0.03)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          cursor: isUploading || isDirectUploading ? 'default' : 'pointer',
          transition: 'border-color 0.15s ease, background 0.15s ease',
          textAlign: 'center',
        }}
      >
        {isUploading || isDirectUploading ? (
          <>
            <Loader
              size={26}
              style={{
                color: '#5170ff',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            <span
              style={{
                fontFamily: 'inherit',
                fontSize: '13px',
                color: 'rgba(237,233,255,0.5)',
              }}
            >
              Uploading and extracting text…
            </span>
          </>
        ) : (
          <>
            <Upload
              size={26}
              style={{
                color: isDragging ? '#5170ff' : 'rgba(81,112,255,0.5)',
                transition: 'color 0.15s ease',
              }}
            />
            <div>
              <p
                style={{
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: isDragging ? '#ede9ff' : 'rgba(237,233,255,0.6)',
                  margin: '0 0 4px',
                  transition: 'color 0.15s ease',
                }}
              >
                Drag & drop or click to upload
              </p>
              <p
                style={{
                  fontFamily: 'inherit',
                  fontSize: '12px',
                  color: 'rgba(237,233,255,0.3)',
                  margin: 0,
                }}
              >
                {ALLOWED_EXTENSIONS.join(', ')} — max 10MB
              </p>
            </div>
          </>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Error message */}
      {error && (
        <div
          style={{
            marginTop: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            fontFamily: 'inherit',
            fontSize: '13px',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(252,165,165,0.6)',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              padding: '0',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
