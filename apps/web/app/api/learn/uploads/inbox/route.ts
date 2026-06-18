import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { getOrCreateInboxNotebook } from '@/lib/inbox';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// POST /api/learn/uploads/inbox — ensure the caller's hidden Inbox notebook
// exists and return its id.
//
// The Study Pack wizard needs this id BEFORE it mints a 'document' signed-url
// (which hard-requires a notebookId). The Inbox is otherwise created lazily on
// the first ad-hoc upload, so a user who has never uploaded — i.e. most users
// reaching the creation flow — would have no Inbox yet and the signed-url call
// would 400. Resolving (get-or-create) here keeps the client path and the
// server-side `/api/learn/uploads` validation pointed at the same notebook.
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const inbox = await getOrCreateInboxNotebook(userId);
    return successResponse({ id: inbox.id });
  } catch (error) {
    console.error('[learn/uploads/inbox POST]', error);
    return internalErrorResponse();
  }
}
