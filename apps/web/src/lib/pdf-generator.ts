import PDFDocument from 'pdfkit';
import type { QuestionKind } from '@notemage/shared';
import { shuffleByKey } from '@/components/quiz/questionRenderers/quizShuffle';
import { parseYearForSort } from '@/lib/timeline-sort';

// Brand colors as hex strings
const BRAND = {
  purple: '#8c52ff',
  dark: '#181732',
  text: '#ede9ff',
  subtext: '#a09cb5',
  white: '#ffffff',
  green: '#4ade80',
};

const KIND_LABEL: Record<QuestionKind, string> = {
  mc: 'Multiple choice',
  true_false: 'True/False',
  fill_blank: 'Fill-in-the-blank',
  word_bank: 'Word bank',
  match_pairs: 'Match pairs',
  sentence_reorder: 'Sentence reorder',
  equation: 'Equation',
  translation: 'Translation',
  code_output: 'Code output',
  timeline: 'Timeline',
  code_write: 'Code writing',
  diagram_cloze: 'Diagram',
};

export async function generateFlashcardPdf(
  setTitle: string,
  flashcards: { question: string; answer: string }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];
    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title page
    doc.fontSize(28).fillColor(BRAND.purple).text(setTitle, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .fillColor(BRAND.subtext)
      .text(`${flashcards.length} Flashcards`, { align: 'center' });
    doc.moveDown(2);

    // Flashcards
    flashcards.forEach((fc, i) => {
      // Check if we need a new page
      if (doc.y > 650) doc.addPage();

      // Card number
      doc
        .fontSize(10)
        .fillColor(BRAND.subtext)
        .text(`Card ${i + 1}`);
      doc.moveDown(0.3);

      // Question
      doc.fontSize(13).fillColor(BRAND.purple).text('Q: ', { continued: true });
      doc.fillColor(BRAND.dark).text(fc.question);
      doc.moveDown(0.3);

      // Answer
      doc.fontSize(12).fillColor(BRAND.purple).text('A: ', { continued: true });
      doc.fillColor(BRAND.dark).text(fc.answer);
      doc.moveDown(0.5);

      // Separator line
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BRAND.purple).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    });

    doc.end();
  });
}

export async function generatePagesPdf(
  notebookTitle: string,
  pages: { title: string; textContent: string }[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];
    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title page
    doc.fontSize(28).fillColor(BRAND.purple).text(notebookTitle, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .fillColor(BRAND.subtext)
      .text(`${pages.length} Page${pages.length !== 1 ? 's' : ''}`, { align: 'center' });
    doc.moveDown(2);

    // Pages
    pages.forEach((page, i) => {
      if (i > 0) doc.addPage();

      // Page title
      doc.fontSize(20).fillColor(BRAND.purple).text(page.title);
      doc.moveDown(0.5);

      // Separator line
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BRAND.purple).lineWidth(0.5).stroke();
      doc.moveDown(0.5);

      // Body text
      doc.fontSize(12).fillColor(BRAND.dark).text(page.textContent, {
        align: 'left',
        lineGap: 4,
      });
    });

    doc.end();
  });
}

// Re-roll a shuffle that reproduces the input order, mirroring the in-app
// renderers (SentenceReorderRenderer / TimelineRenderer). Without this, a 1/n!
// fraction of ordering/pool questions (50% at n=2) would print the items in
// answer order on the question page — re-opening the very leak the shuffle
// closes. Cap the re-rolls so a genuinely tiny set can't loop.
function shuffleNonIdentity<T>(items: T[], key: string): T[] {
  if (items.length <= 1) return [...items];
  let out = shuffleByKey(items, key);
  for (let attempt = 1; attempt < 6 && out.every((v, i) => v === items[i]); attempt++) {
    out = shuffleByKey(items, `${key}#${attempt}`);
  }
  return out;
}

export async function generateQuizPdf(
  setTitle: string,
  questions: {
    /** Stable id — seeds the deterministic shuffle so the paper layout matches
     *  the in-app one and never prints ordering answers in source order. */
    id?: string;
    kind?: QuestionKind;
    question: string;
    options: string[];
    correctIndex: number;
    /** Per-kind payload (the discriminated union in @notemage/shared/quiz). */
    payload?: unknown;
    hint?: string | null;
    correctExplanation?: string | null;
    wrongExplanation?: string | null;
  }[],
  options?: { includeAnswerKey?: boolean }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Uint8Array[] = [];
    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const OPTION_LABELS = ['A', 'B', 'C', 'D'];

    // Title page
    doc.fontSize(28).fillColor(BRAND.purple).text(setTitle, { align: 'center' });
    doc.moveDown(0.5);
    doc
      .fontSize(14)
      .fillColor(BRAND.subtext)
      .text(`${questions.length} Questions`, { align: 'center' });
    doc.moveDown(2);

    // Questions
    questions.forEach((q, i) => {
      if (doc.y > 600) doc.addPage();

      const kind: QuestionKind = q.kind ?? 'mc';

      doc
        .fontSize(14)
        .fillColor(BRAND.dark)
        .text(`${i + 1}. ${q.question}`);
      doc.moveDown(0.3);

      if (kind === 'mc') {
        q.options.forEach((opt, j) => {
          doc.fontSize(12).fillColor(BRAND.subtext).text(`   ${OPTION_LABELS[j]}.  ${opt}`);
          doc.moveDown(0.15);
        });
      } else {
        // Render a paper-friendly form of each non-MC kind (prompt, choices,
        // blanks, or worked items) so the export is actually usable offline.
        const p = (q.payload ?? {}) as Record<string, unknown>;
        // Stable per-question seed so the printed arrangement is deterministic
        // and never echoes the answer in source order (mirrors the in-app shuffle).
        const shuffleKey = q.id ?? `q${i}`;
        const line = (s: string) => {
          doc.fontSize(12).fillColor(BRAND.subtext).text(`   ${s}`);
          doc.moveDown(0.15);
        };
        const blankLine = '__________________________';

        switch (kind) {
          case 'true_false':
            line('A.  True');
            line('B.  False');
            break;
          case 'fill_blank':
            line(blankLine);
            break;
          case 'translation': {
            const lang = typeof p.targetLanguage === 'string' ? p.targetLanguage : null;
            if (lang) line(`Translate into ${lang}:`);
            line(blankLine);
            break;
          }
          case 'word_bank': {
            const template = typeof p.template === 'string' ? p.template : q.question;
            line(template);
            const bank = Array.isArray(p.wordBank) ? (p.wordBank as unknown[]).map(String) : [];
            if (bank.length) line(`Word bank:  ${bank.join('  ·  ')}`);
            break;
          }
          case 'match_pairs': {
            // List the left items, then a shuffled pool of the right options —
            // without the pool the question can't be answered on paper.
            const pairs = Array.isArray(p.pairs) ? (p.pairs as Record<string, unknown>[]) : [];
            pairs.forEach((pair, j) => line(`${j + 1}.  ${String(pair.left ?? '')}   ->   ____`));
            const rights = shuffleNonIdentity(
              pairs.map((pair) => String(pair.right ?? '')),
              shuffleKey,
            );
            if (rights.length) line(`Options:  ${rights.join('  ·  ')}`);
            break;
          }
          case 'sentence_reorder': {
            // Shuffle before printing — the payload stores segments in the
            // correct order, so listing them verbatim would leak the answer.
            line('Put these in the correct order:');
            const raw = Array.isArray(p.correctOrder)
              ? (p.correctOrder as unknown[]).map(String)
              : [];
            shuffleNonIdentity(raw, shuffleKey).forEach((seg) => line(`•  ${seg}`));
            break;
          }
          case 'equation':
            line('Answer:  ____________________');
            break;
          case 'code_output': {
            const code = typeof p.code === 'string' ? p.code : null;
            if (code) {
              doc.fontSize(10).font('Courier').fillColor(BRAND.dark).text(`   ${code}`);
              doc.font('Helvetica');
              doc.moveDown(0.15);
            }
            line('Output:  ____________________');
            break;
          }
          case 'timeline': {
            // Shuffle the labels — listing events in stored (chronological)
            // order would hand over the answer.
            line('Put these events in chronological order:');
            const events = Array.isArray(p.events) ? (p.events as Record<string, unknown>[]) : [];
            const labels = shuffleNonIdentity(
              events.map((e) => String(e.label ?? '')),
              shuffleKey,
            );
            labels.forEach((label) => line(`•  ${label}`));
            break;
          }
          case 'code_write': {
            const lang = typeof p.language === 'string' ? p.language : 'code';
            line(`Write ${lang} that passes these tests:`);
            const tests = Array.isArray(p.tests) ? (p.tests as Record<string, unknown>[]) : [];
            tests.forEach((t, j) =>
              line(
                `Test ${j + 1}: input "${String(t.stdin ?? '')}" -> expected "${String(
                  t.expectedStdout ?? '',
                )}"`,
              ),
            );
            break;
          }
          default:
            doc
              .fontSize(11)
              .fillColor(BRAND.subtext)
              .text(`   [${KIND_LABEL[kind]} question — answer in the NoteMage app]`);
            doc.moveDown(0.15);
        }
      }

      doc.moveDown(0.5);

      // Separator
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BRAND.purple).lineWidth(0.5).stroke();
      doc.moveDown(0.5);
    });

    // Answer key page (if requested, default to true)
    if (options?.includeAnswerKey !== false) {
      doc.addPage();
      doc.fontSize(22).fillColor(BRAND.purple).text('Answer Key', { align: 'center' });
      doc.moveDown(1);

      questions.forEach((q, i) => {
        if (doc.y > 700) doc.addPage();

        const kind: QuestionKind = q.kind ?? 'mc';

        if (kind === 'mc') {
          doc
            .fontSize(12)
            .fillColor(BRAND.dark)
            .text(`${i + 1}. ${OPTION_LABELS[q.correctIndex]} — ${q.options[q.correctIndex]}`);

          if (q.correctExplanation) {
            doc.fontSize(10).fillColor(BRAND.subtext).text(`   ${q.correctExplanation}`);
          }
        } else {
          const p = (q.payload ?? {}) as Record<string, unknown>;
          const blank = (p.blank ?? {}) as Record<string, unknown>;
          const acceptable = Array.isArray(blank.acceptableAnswers)
            ? (blank.acceptableAnswers as unknown[]).map(String)
            : [];
          let ans = '';
          switch (kind) {
            case 'true_false':
              ans = p.correct === true ? 'True' : 'False';
              break;
            case 'fill_blank':
            case 'translation':
            case 'code_output':
              ans = acceptable.join('  /  ');
              break;
            case 'word_bank': {
              const slots = Array.isArray(p.slots) ? (p.slots as Record<string, unknown>[]) : [];
              ans = slots.map((s) => String(s.correctAnswer ?? '')).join(', ');
              break;
            }
            case 'match_pairs': {
              const pairs = Array.isArray(p.pairs) ? (p.pairs as Record<string, unknown>[]) : [];
              ans = pairs
                .map((pr) => `${String(pr.left ?? '')} -> ${String(pr.right ?? '')}`)
                .join(';  ');
              break;
            }
            case 'sentence_reorder': {
              const segs = Array.isArray(p.correctOrder)
                ? (p.correctOrder as unknown[]).map(String)
                : [];
              ans = segs.join('  ->  ');
              break;
            }
            case 'equation':
              ans = typeof p.expectedExpression === 'string' ? p.expectedExpression : '';
              break;
            case 'timeline': {
              // Sort by parsed year — stored array order isn't guaranteed
              // chronological (and BCE/mixed-era years don't sort lexically),
              // and the grader treats `year` as authoritative.
              const events = Array.isArray(p.events) ? (p.events as Record<string, unknown>[]) : [];
              ans = [...events]
                .sort((a, b) => parseYearForSort(String(a.year ?? '')) - parseYearForSort(String(b.year ?? '')))
                .map((e) => `${String(e.year ?? '')}: ${String(e.label ?? '')}`)
                .join('  ->  ');
              break;
            }
            case 'code_write': {
              const tests = Array.isArray(p.tests) ? (p.tests as Record<string, unknown>[]) : [];
              ans = tests
                .map((t) => `"${String(t.stdin ?? '')}" -> "${String(t.expectedStdout ?? '')}"`)
                .join(';  ');
              break;
            }
            default:
              ans = `${KIND_LABEL[kind]} — answer key only viewable in-app`;
          }
          doc
            .fontSize(12)
            .fillColor(BRAND.dark)
            .text(`${i + 1}. ${ans || '—'}`);
          if (q.correctExplanation) {
            doc.fontSize(10).fillColor(BRAND.subtext).text(`   ${q.correctExplanation}`);
          }
        }
        doc.moveDown(0.3);
      });
    }

    doc.end();
  });
}
