/**
 * Centralized file validation rules for client-side use.
 * Each purpose maps to the accepted MIME types for that upload context.
 */

export const UPLOAD_RULES: Record<string, { accept: string[] }> = {
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
};

/**
 * Validate a file against the rules for a given purpose.
 * Returns an error message string, or null if valid.
 */
export function validateFile(file: File, purpose: string): string | null {
  const rules = UPLOAD_RULES[purpose];
  if (!rules) return `Unknown upload purpose: ${purpose}`;

  if (!rules.accept.includes(file.type)) {
    const friendly = rules.accept
      .map((t) => t.split('/').pop()?.toUpperCase())
      .join(', ');
    return `Unsupported file type. Allowed: ${friendly}`;
  }

  return null;
}
