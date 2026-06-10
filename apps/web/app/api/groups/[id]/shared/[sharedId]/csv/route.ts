import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string; sharedId: string }> };

// GET /api/groups/:id/shared/:sharedId/csv — download flashcard set as CSV
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, sharedId } = await context.params;

    // Verify membership
    const membership = await db.studyGroupMember.findUnique({
      where: { groupId_userId: { groupId: id, userId } },
    });
    if (!membership || membership.status !== 'accepted') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the shared content record
    const shared = await db.groupSharedContent.findUnique({
      where: { id: sharedId },
    });
    if (!shared || shared.groupId !== id || shared.contentType !== 'flashcard_set') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch the flashcard set with cards
    const flashcardSet = await db.flashcardSet.findUnique({
      where: { id: shared.contentId },
      include: {
        flashcards: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!flashcardSet) {
      return NextResponse.json({ error: 'Flashcard set not found' }, { status: 404 });
    }

    // Build CSV
    const rows = [['Question', 'Answer']];
    for (const card of flashcardSet.flashcards) {
      rows.push([escapeCsv(card.question), escapeCsv(card.answer)]);
    }

    const csv = rows.map((row) => row.join(',')).join('\n');
    const filename = `${flashcardSet.title.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function escapeCsv(value: string): string {
  // Neutralize CSV/formula injection: a cell beginning with = + - @ (or a tab/CR
  // that a spreadsheet treats as a formula lead-in) is prefixed with a single
  // quote so Excel/Sheets/LibreOffice render it as literal text, not a formula.
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
