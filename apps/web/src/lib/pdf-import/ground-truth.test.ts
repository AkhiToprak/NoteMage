import { describe, it, expect, beforeAll } from 'vitest';
import PDFDocument from 'pdfkit';
import { extractGroundTruth, type GroundTruthPage } from './ground-truth';
import type { Line } from './pdfjs-geometry';

// Fixtures are generated with pdfkit at test time rather than committed
// binaries. The full real-world golden corpus (`__fixtures__/`) lands in
// phase 7; these synthetic PDFs cover what phase 2 must verify on its own:
// page counts, text-layer detection, and encrypted-PDF handling.

function renderPdf(
  build: (doc: PDFKit.PDFDocument) => void,
  options: PDFKit.PDFDocumentOptions = {},
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument(options);
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

const lineText = (line: Line): string => line.cells.map((c) => c.text).join(' ');
const pageText = (page: GroundTruthPage): string => page.lines.map(lineText).join('\n');

describe('extractGroundTruth', () => {
  let textPdf: Buffer;
  let scannedPdf: Buffer;
  let encryptedPdf: Buffer;
  let germanPdf: Buffer;

  beforeAll(async () => {
    textPdf = await renderPdf((doc) => {
      doc.fontSize(26).text('Chapter One');
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(
          'This is the opening paragraph of the fixture document. It deliberately ' +
            'contains several sentences and a generous number of words so that the ' +
            'extracted page carries an unmistakable, genuine text layer for the ' +
            'ground-truth extractor to read back.',
        );
      doc.moveDown(0.5);
      doc.text(
        'A second paragraph follows the first. It exists purely to push the ' +
          'per-page text-item count well above the scanned-PDF detection ' +
          'threshold, regardless of how finely the parser splits text runs.',
      );
      doc.addPage();
      doc.fontSize(26).text('Chapter Two');
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .text(
          'The second page of the fixture also carries multiple lines of real, ' +
            'extractable prose. Both pages together make the two-page count and the ' +
            'presence of a text layer completely unambiguous for the test.',
        );
    });

    scannedPdf = await renderPdf((doc) => {
      doc.rect(60, 60, 380, 480).fill('#cfcfcf');
      doc.addPage();
      doc.rect(60, 60, 380, 480).fill('#bdbdbd');
    });

    encryptedPdf = await renderPdf(
      (doc) => {
        doc.fontSize(14).text('Locked content behind a user password.');
      },
      { userPassword: 'open-sesame', ownerPassword: 'owner-key', pdfVersion: '1.7' },
    );

    germanPdf = await renderPdf((doc) => {
      doc.fontSize(14).text('Die Größe der Lösung beträgt dreißig Maßeinheiten.');
    });
  });

  it('counts pages and numbers them from 1', async () => {
    const gt = await extractGroundTruth(textPdf);
    expect(gt.pageCount).toBe(2);
    expect(gt.pages).toHaveLength(2);
    expect(gt.pages.map((p) => p.pageNumber)).toEqual([1, 2]);
  });

  it('flags a digital PDF as having a text layer', async () => {
    const gt = await extractGroundTruth(textPdf);
    expect(gt.hasTextLayer).toBe(true);
    expect(gt.encrypted).toBe(false);
  });

  it('extracts the text layer verbatim', async () => {
    const gt = await extractGroundTruth(textPdf);
    const page1 = pageText(gt.pages[0]);
    expect(page1).toContain('Chapter One');
    expect(page1).toContain('opening');
    expect(page1).toContain('deliberately');
    expect(pageText(gt.pages[1])).toContain('Chapter Two');
  });

  it('preserves the visual font-size hierarchy', async () => {
    const gt = await extractGroundTruth(textPdf);
    const page = gt.pages[0];
    const headingLine = page.lines.find((l) => lineText(l).includes('Chapter One'));
    const bodyLine = page.lines.find((l) => lineText(l).includes('deliberately'));
    if (!headingLine || !bodyLine) throw new Error('expected a heading line and a body line');
    expect(headingLine.fontSize).toBeGreaterThan(bodyLine.fontSize);
  });

  it('reports page geometry', async () => {
    const gt = await extractGroundTruth(textPdf);
    for (const page of gt.pages) {
      expect(page.width).toBeGreaterThan(0);
      expect(page.height).toBeGreaterThan(0);
      expect(page.lines.length).toBeGreaterThan(0);
    }
  });

  it('flags a PDF with no text layer as scanned', async () => {
    const gt = await extractGroundTruth(scannedPdf);
    expect(gt.pageCount).toBe(2);
    expect(gt.encrypted).toBe(false);
    expect(gt.hasTextLayer).toBe(false);
    expect(gt.pages.every((p) => p.lines.length === 0)).toBe(true);
  });

  it('detects an encrypted PDF without throwing', async () => {
    const gt = await extractGroundTruth(encryptedPdf);
    expect(gt.encrypted).toBe(true);
    expect(gt.pageCount).toBe(0);
    expect(gt.pages).toHaveLength(0);
    expect(gt.hasTextLayer).toBe(false);
  });

  it('extracts non-ASCII text (German umlauts and ß) verbatim', async () => {
    const gt = await extractGroundTruth(germanPdf);
    const text = pageText(gt.pages[0]);
    expect(text).toContain('Größe');
    expect(text).toContain('Lösung');
    expect(text).toContain('Maßeinheiten');
  });
});
