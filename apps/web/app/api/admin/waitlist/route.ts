import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, forbiddenResponse, internalErrorResponse } from '@/lib/api-response';
import { sendLaunchAnnouncement } from '@/lib/waitlist-email';

// GET — list all waitlist subscribers (admin only)
export async function GET(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const skip = (page - 1) * limit;

    const [subscribers, total] = await Promise.all([
      db.waitlist.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.waitlist.count(),
    ]);

    return successResponse({
      subscribers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch {
    return internalErrorResponse();
  }
}

// POST — send launch announcement to all waitlist subscribers (admin only)
export async function POST(request: NextRequest) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const entries = await db.waitlist.findMany({ select: { email: true } });
    const emails = entries.map((e) => e.email);

    if (emails.length === 0) {
      return successResponse({ sent: 0 }, 'No subscribers on the waitlist.');
    }

    await sendLaunchAnnouncement(emails);

    return successResponse(
      { sent: emails.length },
      `Launch announcement queued for ${emails.length} subscribers.`
    );
  } catch {
    return internalErrorResponse();
  }
}
