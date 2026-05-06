import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  unauthorizedResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { generateSlidesAsPptx, generatePresentationPptx } from '@/lib/pptx-generator';
import type { PresentationSlide } from '@/lib/pptx-generator';

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { title, slides, themeColor, presentationSlides } = body as {
      title?: string;
      slides?: { title: string; content: string; notes?: string }[];
      themeColor?: string;
      presentationSlides?: PresentationSlide[];
    };

    if (!title) {
      return badRequestResponse('Title is required');
    }

    // Rich presentation slides (from AI-generated presentations)
    if (presentationSlides && Array.isArray(presentationSlides) && presentationSlides.length > 0) {
      if (presentationSlides.length > 500) {
        return badRequestResponse('Too many slides (max 500)');
      }
      const buffer = await generatePresentationPptx(
        title,
        themeColor || '2E75B6',
        presentationSlides
      );
      const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pptx`;
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Simple slides (from slide editor)
    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return badRequestResponse('Slides array is required');
    }
    if (slides.length > 500) {
      return badRequestResponse('Too many slides (max 500)');
    }

    const buffer = await generateSlidesAsPptx(title, slides);
    const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.pptx`;

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
