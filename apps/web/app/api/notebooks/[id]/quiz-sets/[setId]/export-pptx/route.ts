import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { unauthorizedResponse, notFoundResponse, internalErrorResponse } from '@/lib/api-response';
import { generateQuizPptx } from '@/lib/pptx-generator';

type Params = { params: Promise<{ id: string; setId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: notebookId, setId } = await params;

    const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId } });
    if (!notebook) return notFoundResponse('Notebook not found');

    const quizSet = await db.quizSet.findFirst({
      where: { id: setId, notebookId },
      include: { questions: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quizSet) return notFoundResponse('Quiz set not found');

    const buffer = await generateQuizPptx(quizSet.title, quizSet.questions);
    const filename = `${quizSet.title.replace(/[^a-zA-Z0-9]/g, '_')}_quiz.pptx`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('PPTX export error:', error);
    return internalErrorResponse();
  }
}
