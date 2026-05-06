import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { getPresetById } from '@/lib/presets';
import {
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId } = await params;

    const notebook = await db.notebook.findFirst({
      where: { id: notebookId, userId },
    });
    if (!notebook) return notFoundResponse('Notebook not found');

    const body = await request.json();
    const { presetId } = body;

    const preset = getPresetById(presetId);
    if (!preset) return badRequestResponse('Unknown preset');

    // Create one section per scaffold title, in order
    const sections = await db.$transaction(
      preset.scaffold.map((title, i) =>
        db.section.create({
          data: {
            notebookId,
            title,
            sortOrder: i,
          },
        })
      )
    );

    return createdResponse({ sections });
  } catch {
    return internalErrorResponse();
  }
}
