'use client';

import { useState, useCallback } from 'react';

interface UploadContext {
  notebookId?: string;
  pageId?: string;
  sectionId?: string;
  cardId?: string;
  setId?: string;
  shareId?: string;
}

interface UploadResult {
  storagePath: string;
  publicUrl?: string;
}

interface UseDirectUploadReturn {
  upload: (file: File, purpose: string, context?: UploadContext) => Promise<UploadResult>;
  isUploading: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * Hook for uploading files directly to Supabase Storage via signed URLs.
 * Bypasses Vercel's 4.5MB serverless function body size limit.
 *
 * Flow:
 * 1. Request a signed upload URL from the server
 * 2. PUT the file directly to Supabase Storage
 * 3. Return the storage path for the server to process
 */
export function useDirectUpload(): UseDirectUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setIsUploading(false);
  }, []);

  const upload = useCallback(
    async (file: File, purpose: string, context: UploadContext = {}): Promise<UploadResult> => {
      setIsUploading(true);
      setError(null);

      try {
        // Step 1: Get signed upload URL from our API
        const urlResponse = await fetch('/api/uploads/signed-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            purpose,
            fileName: file.name,
            contentType: file.type,
            ...context,
          }),
        });

        const urlData = await urlResponse.json();

        if (!urlResponse.ok || !urlData.success) {
          throw new Error(urlData.error || 'Failed to get upload URL');
        }

        const { signedUrl, storagePath, publicUrl } = urlData.data;

        // Step 2: Upload file directly to Supabase Storage
        const uploadResponse = await fetch(signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type,
            'x-upsert': 'true',
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text().catch(() => 'Unknown error');
          throw new Error(`Upload failed: ${errorText}`);
        }

        return { storagePath, publicUrl };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  return { upload, isUploading, error, reset };
}
