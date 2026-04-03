import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return forbiddenResponse('Authentication required');

    // Cascade delete handles all related records
    await db.user.delete({ where: { id: userId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}
