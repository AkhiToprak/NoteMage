import type { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import { getGeminiClient } from '../gemini';

// Subject detection for the multi-PDF import flow. Given a set of uploaded
// PDFs (file name + a short text sample each), one Gemini Flash-Lite call
// groups them into proposed notebooks by subject. It NEVER hard-fails: a
// missing API key, a timeout, or malformed output all fall back to one
// notebook per file, and the result always covers every input exactly once.

/**
 * Env-overridable model id for subject detection. Exported so the classify
 * route can reference the same resolved value for usage ledger accuracy —
 * a hardcoded default there would log a model the call never used (PA-40b).
 */
export const SUBJECT_MODEL = process.env.GEMINI_PDF_MODEL ?? 'gemini-2.5-flash-lite';
const CALL_TIMEOUT_MS = 30_000;

export interface SubjectDetectItem {
  /** Stable id the model echoes back — dedup-proof vs. duplicate file names. */
  id: string;
  fileName: string;
  /** Short verbatim text sample; empty for a scanned / unreadable PDF. */
  textSample: string;
}

export interface ProposedGroup {
  /** Suggested notebook name. */
  name: string;
  /** Broad subject label — may be an empty string. */
  subject: string;
  /** Ids of the items grouped into this notebook. */
  fileIds: string[];
}

/** Gemini token counts for the one classify call (both 0 when no model ran). */
export interface SubjectDetectUsage {
  /** `usageMetadata.promptTokenCount` — input tokens. */
  promptTokens: number;
  /** `usageMetadata.candidatesTokenCount` — output tokens. */
  candidatesTokens: number;
}

export interface SubjectDetectResult {
  groups: ProposedGroup[];
  /** Token usage for the model call; zeroed on every fallback path. */
  usage: SubjectDetectUsage;
}

const NO_USAGE: SubjectDetectUsage = { promptTokens: 0, candidatesTokens: 0 };

const groupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().max(60),
  fileIds: z.array(z.string()).min(1),
});
const responseSchema = z.object({ groups: z.array(groupSchema) });

const SYSTEM_PROMPT = `You organize a student's uploaded study materials into study packs.

You are given a list of PDF files. Each file has an id, a file name, and a short text sample from its first pages.

Group the files into study packs by academic subject or topic. Rules:
- Files about the same subject or course go in the same study pack.
- A file with a clearly distinct topic gets its own study pack.
- Prefer fewer, well-themed study packs, but never force unrelated files together.
- "name" is a concise, human study pack title (e.g. "Organic Chemistry", "World History II").
- "subject" is a single broad subject word when one clearly applies (e.g. "Chemistry", "History", "Mathematics"); otherwise an empty string.
- Every provided file id must appear in exactly one group.

Return ONLY a JSON object of the form { "groups": [ { "name": string, "subject": string, "fileIds": string[] } ] }. No prose, no markdown.`;

/** Resolve the shared Gemini client, returning null when the API key is
 *  missing so the multi-import flow can fall back to one-notebook-per-file
 *  without throwing. */
function getClient(): GoogleGenAI | null {
  try {
    return getGeminiClient();
  } catch {
    return null;
  }
}

/** Strip the extension and tidy separators for a friendly notebook name. */
function niceName(fileName: string): string {
  const base = fileName
    .replace(/\.[^./\\]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.length > 0 ? base.slice(0, 80) : 'Imported notes';
}

/** One notebook per file — the guaranteed, never-fails grouping. */
function fallbackGroups(items: SubjectDetectItem[]): ProposedGroup[] {
  return items.map((item) => ({
    name: niceName(item.fileName),
    subject: '',
    fileIds: [item.id],
  }));
}

/** Pull the first balanced JSON object out of a possibly fenced response. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object in response');
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Group uploaded PDFs into proposed notebooks by subject via a single
 * Gemini Flash-Lite call. Never throws; on any failure (no key, timeout,
 * malformed output) it returns one notebook per file. The returned groups
 * always cover every input item exactly once.
 *
 * Returns the model call's token usage alongside the groups so the caller can
 * meter the (paid) classify call against the monthly budget. Every fallback
 * path — no key, single file, timeout, malformed output — reports zero usage
 * because no billable model call ran (or its tokens are unrecoverable).
 */
export async function detectSubjects(items: SubjectDetectItem[]): Promise<SubjectDetectResult> {
  if (items.length === 0) return { groups: [], usage: { ...NO_USAGE } };
  // A single file has nothing to group — skip the model call entirely.
  if (items.length === 1) return { groups: fallbackGroups(items), usage: { ...NO_USAGE } };

  const client = getClient();
  if (!client) return { groups: fallbackGroups(items), usage: { ...NO_USAGE } };

  try {
    const userText = items
      .map(
        (item) =>
          `id: ${item.id}\nfile: ${item.fileName}\nsample: ${
            item.textSample.slice(0, 1200).replace(/\s+/g, ' ').trim() ||
            '(no extractable text)'
          }`,
      )
      .join('\n\n---\n\n');

    const response = await client.models.generateContent({
      model: SUBJECT_MODEL,
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0,
        // PA-40a: cap output so a degenerate loop on a paid route can't run
        // forever. 2048 tokens is well above any realistic grouping response.
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
    });

    const u = response.usageMetadata;
    const usage: SubjectDetectUsage = {
      promptTokens: u?.promptTokenCount ?? 0,
      candidatesTokens: u?.candidatesTokenCount ?? 0,
    };

    const parsed = responseSchema.safeParse(extractJson(response.text ?? ''));
    // Even when the output is unusable the call was still billed — keep the
    // token usage so it counts toward the monthly meter.
    if (!parsed.success) return { groups: fallbackGroups(items), usage };

    return { groups: reconcile(parsed.data.groups, items), usage };
  } catch (err) {
    console.error('[multi-import] subject detection failed — using fallback', err);
    return { groups: fallbackGroups(items), usage: { ...NO_USAGE } };
  }
}

/**
 * Force the model's groups to cover every input item exactly once: drop
 * unknown or duplicate ids (first occurrence wins), drop emptied groups,
 * and give any item the model forgot its own notebook.
 */
function reconcile(groups: ProposedGroup[], items: SubjectDetectItem[]): ProposedGroup[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const result: ProposedGroup[] = [];

  for (const group of groups) {
    const ids = group.fileIds.filter((id) => byId.has(id) && !seen.has(id));
    if (ids.length === 0) continue;
    for (const id of ids) seen.add(id);
    result.push({
      name: group.name.trim().slice(0, 80) || niceName(byId.get(ids[0])!.fileName),
      subject: group.subject.trim().slice(0, 60),
      fileIds: ids,
    });
  }

  for (const item of items) {
    if (seen.has(item.id)) continue;
    result.push({ name: niceName(item.fileName), subject: '', fileIds: [item.id] });
  }

  return result.length > 0 ? result : fallbackGroups(items);
}
