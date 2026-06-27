import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import {
  loadNotificationPreferences,
  parseNotificationPreferences,
  saveNotificationPreferences,
  isMissingNotificationPrefRelation,
} from '@/lib/notification-preferences';

// Exam Mode (Phase 6) — DB-backed notification/reminder preferences. GET reads
// (defaulting when no row / table not migrated yet); PUT upserts the full set.

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const prefs = await loadNotificationPreferences(userId);
    return successResponse(prefs);
  } catch {
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json().catch(() => ({}));
    const prefs = parseNotificationPreferences(body);

    try {
      const saved = await saveNotificationPreferences(userId, prefs);
      return successResponse(saved);
    } catch (error) {
      // Pre-migration: the table doesn't exist yet. Echo the parsed prefs back
      // so the UI stays consistent (the toggle still flips) rather than erroring
      // — the write just isn't durable until the migration lands.
      if (isMissingNotificationPrefRelation(error)) return successResponse(prefs);
      throw error;
    }
  } catch {
    return internalErrorResponse();
  }
}
