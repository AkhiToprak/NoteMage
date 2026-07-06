import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { successResponse, forbiddenResponse, internalErrorResponse } from '@/lib/api-response';
import { deleteUserCompletely } from '@/lib/account-deletion';

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return forbiddenResponse('Authentication required');

    // Teardown (billing cancel → storage purge → cascade delete) is shared with
    // the paused-account deletion sweep. See src/lib/account-deletion.ts.
    await deleteUserCompletely(userId);

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
