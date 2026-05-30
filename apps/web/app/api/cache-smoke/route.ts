// TEMPORARY verification endpoint for explicit Gemini context caching.
//
// Token-gated. Runs the exact pattern src/lib/path-generator-gemini.ts relies
// on — caches.create (systemInstruction-only, no `contents`) → generateContent
// referencing it → caches.delete — and reports the token usage so we can
// confirm in the real (Coolify) environment that a system-instruction-only
// cache is accepted and that `cachedContentTokenCount` is populated.
//
// DELETE THIS FILE once verified. It exists only because GEMINI_API_KEY is
// not available in local dev (only in the deployed container).
import { NextResponse } from 'next/server';
import type { GoogleGenAI } from '@google/genai';
import { getGeminiClient, GEMINI_PATH_MODEL } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

const SMOKE_TOKEN = 'cs_4e9b1f7a3d2c8061b5fae93770c14d28';

export async function GET(request: Request): Promise<Response> {
  if (new URL(request.url).searchParams.get('token') !== SMOKE_TOKEN) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const model = process.env.GEMINI_PATH_MODEL ?? GEMINI_PATH_MODEL;
  const para =
    'You are NoteMage, an AI tutor that writes structured learning content. ' +
    'Always output a single JSON object with camelCase keys and no markdown ' +
    'fences. Ground every answer in the provided material and never contradict ' +
    'it. Keep explanations warm, plain, and example-driven. ';
  const systemInstruction = para.repeat(40); // ~8.8k chars ≈ ~1.8k tokens (> 1024 min)

  let client: GoogleGenAI | undefined;
  let cacheName: string | undefined;
  try {
    client = getGeminiClient();
    const cached = await client.caches.create({
      model,
      config: { systemInstruction, ttl: '300s', displayName: 'notemage-cache-smoke' },
    });
    cacheName = cached.name ?? undefined;

    const res = await client.models.generateContent({
      model,
      contents: [
        { role: 'user', parts: [{ text: 'Reply with the JSON object {"ok":true} and nothing else.' }] },
      ],
      config: {
        cachedContent: cacheName,
        responseMimeType: 'application/json',
        maxOutputTokens: 100,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const u = res.usageMetadata ?? {};
    return NextResponse.json({
      ok: true,
      model,
      prefixChars: systemInstruction.length,
      cacheName,
      promptTokenCount: u.promptTokenCount ?? null,
      cachedContentTokenCount: u.cachedContentTokenCount ?? null,
      text: res.text ?? null,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      cacheName: cacheName ?? null,
    });
  } finally {
    if (client && cacheName) {
      try {
        await client.caches.delete({ name: cacheName });
      } catch {
        /* best-effort; the 300s TTL expires it anyway */
      }
    }
  }
}
