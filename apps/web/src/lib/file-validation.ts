/**
 * Centralized file validation rules for client-side use.
 * Each purpose maps to the accepted MIME types for that upload context, plus an
 * optional per-purpose byte cap (the authoritative ceiling is still the Supabase
 * bucket's fileSizeLimit; this is a client-side early reject).
 */

/** Client-side byte cap for native video uploads. Matches MAX_UPLOAD_BYTES in
 *  app/api/uploads/signed-url/route.ts (ship V1 at the 50 MB bucket limit). */
export const VIDEO_IMPORT_MAX_BYTES = 50 * 1024 * 1024;

export const UPLOAD_RULES: Record<string, { accept: string[]; maxBytes?: number }> = {
  'page-image': {
    accept: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  },
  'flashcard-image': {
    accept: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  },
  'shared-image': {
    accept: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  },
  avatar: {
    accept: ['image/png', 'image/jpeg', 'image/webp'],
  },
  'post-image': {
    accept: ['image/png', 'image/jpeg', 'image/webp'],
  },
  document: {
    accept: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ],
  },
  'section-import': {
    accept: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/plain',
      'text/markdown',
    ],
  },
  'flashcard-import': {
    accept: [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream', // .apkg files
    ],
  },
  'pdf-import': {
    accept: ['application/pdf'],
  },
  'video-import': {
    accept: ['video/mp4', 'video/quicktime', 'video/webm'],
    maxBytes: VIDEO_IMPORT_MAX_BYTES,
  },
};

/**
 * Validate a file against the rules for a given purpose.
 * Returns an error message string, or null if valid.
 */
export function validateFile(file: File, purpose: string): string | null {
  const rules = UPLOAD_RULES[purpose];
  if (!rules) return `Unknown upload purpose: ${purpose}`;

  if (!rules.accept.includes(file.type)) {
    const friendly = rules.accept.map((t) => t.split('/').pop()?.toUpperCase()).join(', ');
    return `Unsupported file type. Allowed: ${friendly}`;
  }

  if (rules.maxBytes !== undefined && file.size > rules.maxBytes) {
    const mb = Math.round(rules.maxBytes / (1024 * 1024));
    return `Too large — ${mb}MB max.`;
  }

  return null;
}

/** Video file extension → the MIME the Gemini Files API expects. The server
 *  re-derives this from the stored file name (a direct upload's Content-Type is
 *  not persisted); falls back to mp4, the most common upload format. */
export function videoMimeFromName(fileName: string): string {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  switch (ext) {
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'mp4':
    case 'm4v':
    default:
      return 'video/mp4';
  }
}
