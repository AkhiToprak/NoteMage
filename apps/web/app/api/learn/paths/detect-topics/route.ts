import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { generatePathStructure } from '@/lib/path-generator';
import { loadMaterialCorpus, renderMaterialCorpus } from '@/lib/path-corpus';
import { pathContentCap } from '@/lib/path-corpus-fit';
import { classifySubjects } from '@/lib/path-classifier';
import { checkTokenBudget } from '@/lib/token-budget';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
import type { PathStructureToolInput } from '@/lib/ai-tools';

// Step 2 of the Study Pack creation wizard — "Mage reads your material".
//
// Runs ONLY Stage A (one inline AI call → the curriculum spine) and returns
// the flattened slot titles as confirmable topics plus the AI-refined title.
// No persistence, no StudyPlan, no Stage B — that all happens later at
// `POST /api/learn/paths` once the user confirms topics + sets a goal.
//
// Ownership + corpus loading mirror `POST /api/learn/paths` exactly so the
// topics the user confirms are grounded in the same content the eventual
// generation will see.

interface DetectTopicsBody {
  materialIds?: string[];
  /** Reserved — pasted text now arrives as an uploaded Document materialId. */
  pasteText?: string;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Stage A is one AI call; bound bursts the same way the create route does
    // so a user can't hammer detection. Fails CLOSED in prod.
    const burst = await costRateLimit(
      rateLimitKey('path-detect-topics', request, userId),
      8,
      60_000,
    );
    if (!burst.success) {
      return tooManyRequestsResponse(
        'Too many topic scans in a short window. Wait a moment and try again.',
        burst.retryAfterMs,
      );
    }

    const { allowed: tokenAllowed, tokenLimit } = await checkTokenBudget(userId);
    if (!tokenAllowed) {
      return tooManyRequestsResponse(
        `Monthly token limit reached (${tokenLimit.toLocaleString()} tokens). Resets on the 1st of next month.`,
      );
    }

    const body = (await request.json().catch(() => ({}))) as DetectTopicsBody;
    const materialIds = Array.isArray(body.materialIds)
      ? body.materialIds.filter((s): s is string => typeof s === 'string')
      : [];

    const pasteText =
      typeof body.pasteText === 'string' && body.pasteText.trim().length > 0
        ? body.pasteText.trim()
        : undefined;

    if (materialIds.length === 0 && !pasteText) {
      return badRequestResponse('Add some material before detecting topics.');
    }

    // Validate material ownership + load the actual content into a corpus.
    const materials = await loadMaterialCorpus(userId, materialIds);
    if (!materials) {
      return badRequestResponse('One or more material IDs are invalid');
    }
    // Detection always runs at the basic content cap — the topic spine is
    // identical regardless of the eventual Ultra choice, and the cheaper cap
    // keeps this cheap.
    let corpus = renderMaterialCorpus(materials, pathContentCap(false));
    // Pasted text without an uploaded Document yet — fold it into the corpus so
    // detection still has something to read.
    if (pasteText) {
      corpus = [corpus, pasteText].filter(Boolean).join('\n\n');
    }

    // A working title for the classifier / Stage A. The AI refines it.
    const seedTitle =
      materials.find((m) => m.title)?.title?.trim().slice(0, 200) || 'New Study Pack';

    const classification = await classifySubjects({
      title: seedTitle,
      corpus: corpus || undefined,
    });

    let structure: PathStructureToolInput;
    try {
      structure = await generatePathStructure({
        userId,
        title: seedTitle,
        corpus: corpus || undefined,
        subjects: classification.subjects,
        subjectWeights: classification.weights,
      });
    } catch (error) {
      console.error('[learn/paths/detect-topics POST] Stage A failed', error);
      return internalErrorResponse('Mage could not read your material. Please try again.');
    }

    // Flatten every section's slot titles in order, de-duplicated (case-folded
    // so "Osmosis" and "osmosis" don't both appear). Final Exam is appended by
    // the create route, never a slot here, so nothing to filter.
    const seen = new Set<string>();
    const topics: string[] = [];
    for (const phase of structure.phases) {
      for (const slot of phase.slots) {
        const title = slot.title?.trim();
        if (!title) continue;
        const key = title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        topics.push(title);
      }
    }

    const suggestedTitle = structure.title?.trim() || seedTitle;

    return successResponse({ suggestedTitle, topics });
  } catch (error) {
    console.error('[learn/paths/detect-topics POST]', error);
    return internalErrorResponse();
  }
}
