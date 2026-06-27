import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { costRateLimit } from '@/lib/rate-limit';
import { clientIpFromHeaders } from '@/lib/client-ip';
import { verifyTurnstile } from '@/lib/turnstile';
import {
  extractYouTubeTranscript,
  CaptionsUnavailableError,
  VideoUnavailableError,
} from '@/lib/youtube';
import {
  capAtBoundary,
  PREVIEW_CORPUS_CHARS,
  MIN_CORPUS_CHARS,
  NOTES_MAX_CHARS,
  type OnboardingSourceKind,
} from '@/lib/onboarding-preview-constants';
import { generatePathPreview, type PreviewResult } from '@/lib/path-preview';
import { normalizePathLanguage, type PathLanguageCode } from '@/lib/path-languages';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { hashIp } from '@/lib/registration';

/**
 * Anonymous, pre-sign-up preview endpoint for the /start/* onboarding (real-
 * generation plan, P1 — the "capture" scaffold).
 *
 * It assembles a SMALL capped corpus from whichever source the visitor brought
 * and stands up the anonymous identity + abuse gates around it:
 *   - upload / notes → the client already extracted a capped text slice
 *     (onboarding-corpus.ts); the heavy bytes stay in IndexedDB and are uploaded
 *     only after auth (D2). We re-cap defensively here.
 *   - link → we fetch the YouTube transcript server-side (capped) rather than
 *     trusting any client text.
 *
 * Gates, in order, BEFORE any model work (D10): kill switch → body-size guard →
 * per-IP cost rate-limit (fails closed in prod) → Turnstile (no-op until
 * TURNSTILE_SECRET_KEY is set, then fails closed).
 *
 * Public via the middleware allowlist (PUBLIC_API_ROUTES → /api/start). Only the
 * fixed YouTube hosts are ever fetched (validated 11-char video id), so the
 * user-supplied URL is not an SSRF surface.
 *
 * P1 returns the assembled corpus summary so the capture pipeline is verifiable
 * end-to-end before generation exists. The two downstream seams are marked
 * inline: P2 calls generatePathPreview() with the corpus; P4 persists a
 * PendingOnboardingPath keyed by the nm_anon token and returns a previewId.
 */

export const runtime = 'nodejs';

const ANON_COOKIE = 'nm_anon';
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 2; // 48h — matches the unclaimed-row TTL (P5)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Plenty for a ~10k-char slice or ~50k-char notes paste; rejects a body large
// enough to be a memory-abuse vector before we read it.
const MAX_BODY_BYTES = 256 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

// ~5 previews/day/IP by default; tunable without a deploy (P5).
const PREVIEW_DAILY_IP_LIMIT = (() => {
  const n = Number.parseInt(process.env.PREVIEW_DAILY_IP_LIMIT ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
})();

type PreviewBody = {
  sourceKind?: unknown;
  title?: unknown;
  cappedText?: unknown;
  /** Notes only (forward-compat): the larger paste kept for completion. */
  fullText?: unknown;
  url?: unknown;
  goal?: unknown;
  intensity?: unknown;
  language?: unknown;
  turnstileToken?: unknown;
};

function fail(reason: string, status: number) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(request: NextRequest) {
  const ip = clientIpFromHeaders(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip'),
  );

  // Kill switch — flips the whole anonymous flow back to the sample/demo path.
  if (process.env.ONBOARDING_PREVIEW_DISABLED === 'true') {
    return fail('disabled', 503);
  }

  // Reject an oversized body before buffering it.
  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return fail('too_large', 413);
  }

  // Per-IP cost limiter (fails closed in prod): anonymous AI is a spend/abuse
  // vector, so cap it before doing any real work.
  const rl = await costRateLimit(`start-preview:${ip}`, PREVIEW_DAILY_IP_LIMIT, DAY_MS);
  if (!rl.success) {
    return fail('rate_limited', 429);
  }

  // Opportunistic TTL sweep (P5): every allowed preview clears out expired,
  // unclaimed rows so abandoned anonymous sessions don't accumulate. Indexed on
  // expiresAt; fire-and-forget so it never blocks or fails the request. Previews
  // are the only writer and are themselves IP-rate-limited, so this keeps cleanup
  // infra-free — no separate cron needed.
  void db.pendingOnboardingPath
    .deleteMany({ where: { status: { not: 'claimed' }, expiresAt: { lt: new Date() } } })
    .catch(() => {});

  let body: PreviewBody;
  try {
    body = (await request.json()) as PreviewBody;
  } catch {
    return fail('invalid_body', 400);
  }

  // Bot gate. No-op until TURNSTILE_SECRET_KEY is configured; once set it fails
  // closed (missing/invalid token, or a verify-endpoint outage, blocks).
  if (!(await verifyTurnstile(body.turnstileToken, ip))) {
    return fail('verification_failed', 400);
  }

  const sourceKind = body.sourceKind as OnboardingSourceKind;
  if (sourceKind !== 'upload' && sourceKind !== 'notes' && sourceKind !== 'link') {
    return fail('invalid_source', 400);
  }

  let title = typeof body.title === 'string' ? body.title.slice(0, 300).trim() : '';
  // `corpus` is the ~10k-char slice generation is grounded in; `fullText` is the
  // larger text we keep for completion at claim (notes paste / video transcript).
  // PDF leaves `fullText` null — its bytes stay client-side in IndexedDB (D2).
  let corpus = '';
  let fullText: string | null = null;

  if (sourceKind === 'link') {
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) return fail('invalid_url', 400);
    try {
      const yt = await extractYouTubeTranscript(url);
      corpus = capAtBoundary(yt.transcript, PREVIEW_CORPUS_CHARS);
      fullText = capAtBoundary(yt.transcript, NOTES_MAX_CHARS);
      title = title || yt.title;
    } catch (err) {
      if (err instanceof CaptionsUnavailableError || err instanceof VideoUnavailableError) {
        // No transcript to learn from → the funnel falls back to sample.
        return fail('no_transcript', 422);
      }
      console.error('[start/preview] transcript fetch failed:', err);
      return fail('transcript_error', 502);
    }
  } else {
    // upload / notes — the client already extracted a capped slice; re-cap so a
    // tampered client can't push more than the budget into the model.
    const cappedText = typeof body.cappedText === 'string' ? body.cappedText : '';
    corpus = capAtBoundary(cappedText, PREVIEW_CORPUS_CHARS);
    // Notes complete from their own text (the bigger paste, capped); a future
    // notes UI can send `fullText` separately — until then the slice is it. PDF
    // (upload) keeps fullText null and completes from cappedCorpus / re-upload.
    if (sourceKind === 'notes') {
      const full = typeof body.fullText === 'string' ? body.fullText : cappedText;
      fullText = capAtBoundary(full, NOTES_MAX_CHARS);
    }
  }

  if (corpus.trim().length < MIN_CORPUS_CHARS) {
    // Too little usable text (scanned PDF, empty notes, captionless video) →
    // caller shows the sample/demo path. Rich OCR is a post-auth concern.
    return fail('insufficient_text', 422);
  }

  // Establish the anonymous identity cookie that P4's claim and P5's per-session
  // cache key off. Generated once; an already-valid cookie is reused as-is.
  const existing = request.cookies.get(ANON_COOKIE)?.value;
  const anonToken = existing && UUID_RE.test(existing) ? existing : randomUUID();

  // ── Generate the preview (P2). Any unrecoverable miss throws and falls back to
  // the sample flow on the client (D11). The setup picks steer tone only.
  const goal = typeof body.goal === 'string' ? body.goal.slice(0, 300) : undefined;
  const intensity = typeof body.intensity === 'string' ? body.intensity.slice(0, 50) : undefined;
  const language = typeof body.language === 'string' ? (body.language as PathLanguageCode) : undefined;

  let preview: PreviewResult;
  try {
    preview = await generatePathPreview({
      corpus,
      meta: { title: title || 'Your study path', goal, intensity, language, sourceKind },
    });
  } catch (err) {
    console.error('[start/preview] generation failed:', err);
    return fail('generation_failed', 502);
  }

  // ── Persist the pending preview (P4), keyed by the anon token — one row per
  //    anonymous session (a re-preview overwrites it). We store the corpus slice
  //    + completion text + the preview artifacts (incl. the lesson's TipTap body,
  //    which is kept OFF the wire below). `/api/start/claim` materializes this
  //    into an owned StudyPlan at signup. A persist failure is non-fatal: the
  //    funnel still renders the preview inline; only the claim would miss.
  const storedLanguage = normalizePathLanguage(language);
  const expiresAt = new Date(Date.now() + ANON_COOKIE_MAX_AGE * 1000);
  const ipHash = ip ? hashIp(ip) : null;
  const pendingData = {
    sourceKind,
    title: preview.title,
    language: storedLanguage,
    goal: goal ?? null,
    intensity: intensity ?? null,
    cappedCorpus: corpus,
    fullText,
    structureJson: preview.structure as unknown as Prisma.InputJsonValue,
    lessonJson: preview.lesson as unknown as Prisma.InputJsonValue,
    previewQuestionsJson: preview.questions as unknown as Prisma.InputJsonValue,
    ipHash,
    expiresAt,
    status: 'ready',
  };
  let previewId: string;
  try {
    const pending = await db.pendingOnboardingPath.upsert({
      where: { anonToken },
      create: { anonToken, ...pendingData },
      // A new preview under the same session resets the claim state.
      update: { ...pendingData, claimedByUserId: null, claimedPlanId: null },
    });
    previewId = pending.id;
  } catch (err) {
    console.error('[start/preview] persist failed:', err);
    previewId = randomUUID();
  }

  const res = NextResponse.json({
    ok: true,
    previewId,
    sourceKind,
    title: preview.title,
    structure: preview.structure,
    // Trimmed lesson: the screens render the structured slice, not the TipTap doc,
    // so the heavy `body` stays off the wire + out of the client store.
    lesson: {
      title: preview.lesson.title,
      intro: preview.lesson.intro,
      example: preview.lesson.example,
      keyIdea: preview.lesson.keyIdea,
      text: preview.lesson.text,
    },
    questions: preview.questions,
  });

  if (!existing || !UUID_RE.test(existing)) {
    res.cookies.set(ANON_COOKIE, anonToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ANON_COOKIE_MAX_AGE,
    });
  }
  return res;
}
