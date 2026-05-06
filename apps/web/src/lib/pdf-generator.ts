import PDFDocument from 'pdfkit';

// Brand colors as hex strings
const BRAND = {
  purple: '#8c52ff',
  dark: '#181732',
  text: '#ede9ff',
  subtext: '#a09cb5',
  white: '#ffffff',
  green: '#4ade80',
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

export async function generateQuizPdf(
  setTitle: string,
  questions: {
    question: string;
    options: string[];
    correctIndex: number;
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

      doc
        .fontSize(14)
        .fillColor(BRAND.dark)
        .text(`${i + 1}. ${q.question}`);
      doc.moveDown(0.3);

      q.options.forEach((opt, j) => {
        doc.fontSize(12).fillColor(BRAND.subtext).text(`   ${OPTION_LABELS[j]}.  ${opt}`);
        doc.moveDown(0.15);
      });

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

        doc
          .fontSize(12)
          .fillColor(BRAND.dark)
          .text(`${i + 1}. ${OPTION_LABELS[q.correctIndex]} — ${q.options[q.correctIndex]}`);

        if (q.correctExplanation) {
          doc.fontSize(10).fillColor(BRAND.subtext).text(`   ${q.correctExplanation}`);
        }
        doc.moveDown(0.3);
      });
    }

    doc.end();
  });
}
