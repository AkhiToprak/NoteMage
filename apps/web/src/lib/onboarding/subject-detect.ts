import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

// Subject detection for the multi-PDF import flow. Given a set of uploaded
// PDFs (file name + a short text sample each), one Gemini Flash-Lite call
// groups them into proposed notebooks by subject. It NEVER hard-fails: a
// missing API key, a timeout, or malformed output all fall back to one
// notebook per file, and the result always covers every input exactly once.

/** Env-overridable — Google rotates model ids; mirrors the PDF engine. */
const SUBJECT_MODEL = process.env.GEMINI_PDF_MODEL ?? 'gemini-2.5-flash-lite';
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

const groupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  subject: z.string().trim().max(60),
  fileIds: z.array(z.string()).min(1),
});
const responseSchema = z.object({ groups: z.array(groupSchema) });

const SYSTEM_PROMPT = `You organize a student's uploaded study materials into notebooks.

You are given a list of PDF files. Each file has an id, a file name, and a short text sample from its first pages.

Group the files into notebooks by academic subject or topic. Rules:
- Files about the same subject or course go in the same notebook.
- A file with a clearly distinct topic gets its own notebook.
- Prefer fewer, well-themed notebooks, but never force unrelated files together.
- "name" is a concise, human notebook title (e.g. "Organic Chemistry", "World History II").
- "subject" is a single broad subject word when one clearly applies (e.g. "Chemistry", "History", "Mathematics"); otherwise an empty string.
- Every provided file id must appear in exactly one group.

Return ONLY a JSON object of the form { "groups": [ { "name": string, "subject": string, "fileIds": string[] } ] }. No prose, no markdown.`;

const globalForGenai = globalThis as unknown as { multiImportGeminiClient?: GoogleGenAI };

/** Lazily build (and in dev, cache) a Gemini client; null when unconfigured. */
function getClient(): GoogleGenAI | null {
  if (globalForGenai.multiImportGeminiClient) return globalForGenai.multiImportGeminiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const client = new GoogleGenAI({ apiKey });
  if (process.env.NODE_ENV !== 'production') globalForGenai.multiImportGeminiClient = client;
  return client;
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
 */
export async function detectSubjects(items: SubjectDetectItem[]): Promise<ProposedGroup[]> {
  if (items.length === 0) return [];
  // A single file has nothing to group — skip the model call entirely.
  if (items.length === 1) return fallbackGroups(items);

  const client = getClient();
  if (!client) return fallbackGroups(items);

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
        responseMimeType: 'application/json',
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
    });

    const parsed = responseSchema.safeParse(extractJson(response.text ?? ''));
    if (!parsed.success) return fallbackGroups(items);

    return reconcile(parsed.data.groups, items);
  } catch (err) {
    console.error('[multi-import] subject detection failed — using fallback', err);
    return fallbackGroups(items);
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
