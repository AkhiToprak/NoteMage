import { NextRequest } from 'next/server';
import { Client } from '@microsoft/microsoft-graph-client';
import { getAuthUserId } from '@/lib/auth';
import { getValidAccessToken } from '@/lib/microsoftAuth';
import {
  successResponse,
  unauthorizedResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * GET – list the user's OneNote notebooks with sections
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Not connected';
      return badRequestResponse(message);
    }

    const client = Client.init({
      authProvider: (done) => done(null, accessToken),
    });

    const response = await client
      .api('/me/onenote/notebooks')
      .select('id,displayName')
      .expand('sections($select=id,displayName)')
      .get();

    const notebooks = (response.value || []).map(
      (nb: { id: string; displayName: string; sections?: { id: string; displayName: string }[] }) => ({
        id: nb.id,
        displayName: nb.displayName,
        sections: (nb.sections || []).map((s) => ({
          id: s.id,
          displayName: s.displayName,
        })),
      })
    );

    return successResponse(notebooks);
  } catch (error) {
    console.error('[OneNote Notebooks] Error:', error);
    return internalErrorResponse();
  }
}
