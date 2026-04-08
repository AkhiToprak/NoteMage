import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { downloadFromStorage, validateStoragePath } from '@/lib/storage';
import { BUCKET_PUBLIC } from '@/lib/supabase';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const MAGIC_BYTES: { ext: string; bytes: number[] }[] = [
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

function detectImageType(buffer: Buffer): string | null {
  for (const { ext, bytes } of MAGIC_BYTES) {
    if (bytes.every((b, i) => buffer[i] === b)) return ext;
  }
  return null;
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: groupId } = await context.params;

    // Verify user is admin or owner
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!membership || !['owner', 'admin', 'teacher'].includes(membership.role) || membership.status !== 'accepted') {
      return forbiddenResponse('Only admins, owners, and teachers can change the avatar');
    }

    const { storagePath } = await request.json();
    if (!storagePath) {
      return badRequestResponse('No storage path provided');
    }

    if (!validateStoragePath(storagePath, 'avatars/')) {
      return badRequestResponse('Invalid storage path');
    }

    const buffer = await downloadFromStorage(storagePath, BUCKET_PUBLIC);

    const ext = detectImageType(buffer);
    if (!ext) {
      return badRequestResponse('Invalid file type. Allowed: PNG, JPEG, WebP');
    }

    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-uploads/${storagePath}`;

    await db.studyGroup.update({
      where: { id: groupId },
      data: { avatarUrl: publicUrl },
    });

    return successResponse({ avatarUrl: publicUrl });
  } catch {
    return internalErrorResponse();
  }
}
