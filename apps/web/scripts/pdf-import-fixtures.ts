/**
 * Generates the PDF-import golden corpus committed to
 * `src/lib/pdf-import/__fixtures__/`. Run once and commit the output:
 *
 *   pnpm --filter web pdf-import:fixtures
 *
 * The corpus is SYNTHETIC — built with pdfkit + @napi-rs/canvas rather
 * than collected from real-world documents. It deterministically covers
 * the structural shapes the import pipeline must survive (headings,
 * columns, callouts, tables, figures, scans, non-ASCII, oversize,
 * encrypted, corrupt). It is honest about layout shape but cannot stand
 * in for the messiness of a genuine scanned textbook — keep that in mind
 * when reading the P7 engine-decision eval (see plans/pdf-import-rebuild.md,
 * "Risks & Open Items" #5).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';

const FIXTURE_DIR = fileURLToPath(
  new URL('../src/lib/pdf-import/__fixtures__/', import.meta.url),
);

/** Fixed so re-runs do not churn the committed binaries' metadata. */
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 64;
const BODY_W = PAGE_W - MARGIN * 2;

/** Render a pdfkit document to a Buffer. */
function renderPdf(
  build: (doc: PDFKit.PDFDocument) => void,
  options: PDFKit.PDFDocumentOptions = {},
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGIN,
      info: { CreationDate: FIXED_DATE, Producer: 'notemage-fixtures' },
      ...options,
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

/** A heading line at one of the three visual sizes. */
function heading(doc: PDFKit.PDFDocument, text: string, level: 1 | 2 | 3): void {
  const size = level === 1 ? 24 : level === 2 ? 16 : 13;
  doc.moveDown(level === 1 ? 0 : 0.7);
  doc.font('Helvetica-Bold').fontSize(size).fillColor('#111111').text(text);
  doc.moveDown(0.4);
}

/** A body paragraph at the canonical 11pt body size. */
function body(doc: PDFKit.PDFDocument, text: string): void {
  doc.font('Helvetica').fontSize(11).fillColor('#1a1a1a').text(text, {
    align: 'left',
    lineGap: 2,
  });
  doc.moveDown(0.5);
}

// --- canvas helpers ---------------------------------------------------------

/** A simple vector "diagram" PNG — shapes only, no reliance on fonts. */
function makeFigurePng(variant: number, w = 460, h = 280): Buffer {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef2ff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#1e1b4b';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  if (variant % 3 === 0) {
    ctx.fillStyle = '#4338ca';
    ctx.fillRect(50, 70, 130, 150);
    ctx.fillStyle = '#0891b2';
    ctx.fillRect(220, 120, 130, 100);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(370, 50, 60, 170);
  } else if (variant % 3 === 1) {
    ctx.fillStyle = '#0d9488';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(w / 2 + 60, h / 2 - 40, 45, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, h - 50);
    for (let x = 40; x <= w - 40; x += 40) {
      ctx.lineTo(x, h - 50 - Math.abs(Math.sin(x / 50)) * 150);
    }
    ctx.stroke();
  }
  return canvas.toBuffer('image/png');
}

/** A full-page image that looks like a scanned sheet of text (no text layer). */
function makeScannedPagePng(headingText: string, lines: string[]): Buffer {
  const w = 850;
  const h = 1100;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f5f1e8'; // off-white "paper"
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1c1c1c';

  ctx.font = 'bold 38px Times New Roman';
  ctx.fillText(headingText, 80, 120);

  ctx.font = '24px Times New Roman';
  let y = 200;
  for (const line of lines) {
    ctx.fillText(line, 80, y);
    y += 44;
  }
  return canvas.toBuffer('image/png');
}

// --- prose pool (for the oversize fixture) ----------------------------------

const SENTENCE_POOL = [
  'The mitochondrion is the organelle where the bulk of cellular energy is produced through oxidative phosphorylation.',
  'Diffusion describes the net movement of particles from a region of higher concentration to one of lower concentration.',
  'A catalyst lowers the activation energy of a reaction without itself being consumed in the process.',
  'Plate boundaries are classified as convergent, divergent, or transform depending on the relative motion of the plates.',
  'The water cycle moves moisture between the oceans, the atmosphere, and the land through evaporation and precipitation.',
  'Natural selection favours heritable traits that improve an organism’s chances of surviving and reproducing.',
  'An electric current is the ordered flow of charge carriers through a conducting material.',
  'Photosynthesis converts light energy into the chemical energy stored in the bonds of glucose molecules.',
  'The periodic table arranges the elements by increasing atomic number and recurring chemical properties.',
  'Supply and demand together determine the equilibrium price at which a market clears.',
  'A function is continuous at a point when its limit there exists and equals the value of the function.',
  'Sedimentary rock forms as layers of mineral and organic particles are compacted and cemented over time.',
];

function paragraphOf(minChars: number, seed: number): string {
  let out = '';
  let i = seed;
  while (out.length < minChars) {
    out += (out.length > 0 ? ' ' : '') + SENTENCE_POOL[i % SENTENCE_POOL.length];
    i += 1;
  }
  return out;
}

// --- fixtures ---------------------------------------------------------------

/** Clean digital PDF: headings, paragraphs, a bullet list and an ordered list. */
function cleanText(): Promise<Buffer> {
  return renderPdf((doc) => {
    heading(doc, 'An Introduction to Cellular Respiration', 1);
    heading(doc, 'Overview', 2);
    body(
      doc,
      'Cellular respiration is the set of metabolic reactions that cells use to ' +
        'convert the chemical energy held in nutrients into adenosine triphosphate, ' +
        'the molecule that powers most cellular work. The process releases waste ' +
        'products and is, in broad terms, the reverse of photosynthesis.',
    );
    body(
      doc,
      'Although the reactions are usually summarised by a single equation, ' +
        'respiration is better understood as three connected stages, each taking ' +
        'place in a different part of the cell and each contributing a share of the ' +
        'total energy yield.',
    );
    heading(doc, 'The Three Stages', 2);
    heading(doc, 'Glycolysis', 3);
    body(
      doc,
      'Glycolysis takes place in the cytoplasm and splits a six-carbon glucose ' +
        'molecule into two molecules of pyruvate. It produces a small net gain of ' +
        'energy and does not itself require oxygen.',
    );
    heading(doc, 'The Citric Acid Cycle', 3);
    body(
      doc,
      'In the mitochondrial matrix the citric acid cycle oxidises the products of ' +
        'glycolysis, releasing carbon dioxide and transferring high-energy electrons ' +
        'to carrier molecules for the final stage.',
    );

    doc.addPage();
    heading(doc, 'Key Terms', 2);
    doc.font('Helvetica').fontSize(11).fillColor('#1a1a1a');
    doc.list(
      [
        'ATP — the universal energy currency of the cell.',
        'Pyruvate — the three-carbon product of glycolysis.',
        'Electron transport chain — the membrane proteins that drive the final stage.',
        'Aerobic — describing a process that depends on oxygen.',
      ],
      { bulletRadius: 2, textIndent: 16, lineGap: 3 },
    );
    doc.moveDown(0.8);

    heading(doc, 'Summary', 2);
    body(
      doc,
      'Respiration extracts energy from nutrients in stages so that it can be ' +
        'captured efficiently rather than lost as heat. The following sequence is ' +
        'worth committing to memory.',
    );
    doc.font('Helvetica').fontSize(11).fillColor('#1a1a1a');
    doc.list(
      [
        'Glucose is split during glycolysis in the cytoplasm.',
        'Pyruvate is oxidised by the citric acid cycle in the matrix.',
        'Electron carriers feed the transport chain to make most of the ATP.',
      ],
      { listType: 'numbered', textIndent: 18, lineGap: 3 },
    );
  });
}

/** Two-column academic layout — a full-width heading over two text columns. */
function multiColumn(): Promise<Buffer> {
  const column = (seed: number): string => paragraphOf(2600, seed);
  return renderPdf((doc) => {
    heading(doc, 'Plate Tectonics and the Drifting Continents', 1);
    doc.font('Helvetica').fontSize(11).fillColor('#1a1a1a').text(column(0), {
      columns: 2,
      columnGap: 24,
      width: BODY_W,
      align: 'justify',
      lineGap: 2,
    });
    doc.addPage();
    heading(doc, 'Evidence from the Ocean Floor', 2);
    doc.font('Helvetica').fontSize(11).fillColor('#1a1a1a').text(column(5), {
      columns: 2,
      columnGap: 24,
      width: BODY_W,
      align: 'justify',
      lineGap: 2,
    });
  });
}

/** A box drawn behind a label + body — the visual shape of a callout. */
function calloutBox(
  doc: PDFKit.PDFDocument,
  label: string,
  text: string,
  fill: string,
  labelColor: string,
): void {
  const x = MARGIN;
  const w = BODY_W;
  const startY = doc.y;
  // Measure the height the text will take so the box wraps it.
  doc.font('Helvetica').fontSize(11);
  const textH = doc.heightOfString(text, { width: w - 28 });
  const boxH = textH + 44;
  doc.roundedRect(x, startY, w, boxH, 8).fill(fill);
  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(labelColor)
    .text(label.toUpperCase(), x + 14, startY + 12);
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#1a1a1a')
    .text(text, x + 14, startY + 28, { width: w - 28, lineGap: 2 });
  doc.y = startY + boxH + 14;
  doc.x = MARGIN;
}

/** Callout-heavy study sheet — several boxed asides per page. */
function calloutHeavy(): Promise<Buffer> {
  return renderPdf((doc) => {
    heading(doc, 'Study Guide: Acids and Bases', 1);
    body(
      doc,
      'This sheet collects the asides you should be able to recall before the ' +
        'assessment. Each box highlights a different kind of point.',
    );
    calloutBox(
      doc,
      'Definition',
      'An acid is a substance that donates a proton, while a base is a substance ' +
        'that accepts one. The strength of an acid reflects how completely it ' +
        'dissociates in water.',
      '#e0e7ff',
      '#3730a3',
    );
    calloutBox(
      doc,
      'Warning',
      'Always add acid to water, never water to acid. The reverse can boil ' +
        'violently and splash concentrated acid out of the container.',
      '#fee2e2',
      '#991b1b',
    );
    calloutBox(
      doc,
      'Tip',
      'Remember the pH scale runs from 0 to 14, with 7 being neutral. Each whole ' +
        'step is a tenfold change in hydrogen-ion concentration.',
      '#dcfce7',
      '#166534',
    );

    doc.addPage();
    heading(doc, 'More Asides', 2);
    calloutBox(
      doc,
      'Note',
      'A buffer solution resists changes in pH when small amounts of acid or base ' +
        'are added. Buffers are central to keeping blood chemistry stable.',
      '#fef9c3',
      '#854d0e',
    );
    calloutBox(
      doc,
      'Example',
      'Hydrochloric acid in the stomach has a pH of roughly 1.5 to 3.5, which is ' +
        'acidic enough to begin breaking down the proteins in food.',
      '#e0e7ff',
      '#3730a3',
    );
    calloutBox(
      doc,
      'Key Point',
      'Neutralisation between an acid and a base always produces a salt and water. ' +
        'The reaction is exothermic and releases measurable heat.',
      '#dcfce7',
      '#166534',
    );
  });
}

/** A grid table: cells placed at fixed column x-positions so columns align. */
function drawTable(
  doc: PDFKit.PDFDocument,
  columnX: number[],
  rows: string[][],
): void {
  const rowH = 26;
  rows.forEach((row, rowIndex) => {
    const y = doc.y;
    const isHeader = rowIndex === 0;
    doc
      .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(11)
      .fillColor('#1a1a1a');
    row.forEach((cell, colIndex) => {
      doc.text(cell, columnX[colIndex], y, { lineBreak: false, width: 110 });
    });
    doc.y = y + rowH;
    doc.x = MARGIN;
  });
  doc.moveDown(0.8);
}

/** Table-heavy fixture — aligned grids the geometry path can detect. */
function tableHeavy(): Promise<Buffer> {
  return renderPdf((doc) => {
    heading(doc, 'Comparison Tables', 1);
    body(
      doc,
      'The tables below summarise material covered earlier. Each column lines up ' +
        'so the figures can be compared down the page.',
    );
    heading(doc, 'Properties of the Inner Planets', 2);
    drawTable(
      doc,
      [MARGIN, MARGIN + 130, MARGIN + 240, MARGIN + 350],
      [
        ['Planet', 'Radius', 'Moons', 'Day length'],
        ['Mercury', '2440 km', '0', '1408 h'],
        ['Venus', '6052 km', '0', '5832 h'],
        ['Earth', '6371 km', '1', '24 h'],
        ['Mars', '3390 km', '2', '25 h'],
      ],
    );

    doc.addPage();
    heading(doc, 'Reaction Rates by Temperature', 2);
    drawTable(
      doc,
      [MARGIN, MARGIN + 150, MARGIN + 300],
      [
        ['Temperature', 'Rate', 'Notes'],
        ['10 C', 'Slow', 'Few collisions'],
        ['25 C', 'Moderate', 'Room standard'],
        ['40 C', 'Fast', 'More collisions'],
        ['60 C', 'Very fast', 'High energy'],
        ['80 C', 'Rapid', 'Near boiling'],
      ],
    );
  });
}

/** A figure caption in the small italic style. */
function caption(doc: PDFKit.PDFDocument, text: string): void {
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555555').text(text, MARGIN, doc.y);
  doc.x = MARGIN;
  doc.moveDown(0.8);
}

/** Image-heavy fixture — diagrams interleaved with explanatory prose. */
function imageHeavy(): Promise<Buffer> {
  return renderPdf((doc) => {
    heading(doc, 'Illustrated Notes', 1);
    body(
      doc,
      'Diagrams carry information that prose alone cannot, but a figure on its ' +
        'own is rarely enough. Each illustration in these notes is wrapped in ' +
        'enough surrounding text to explain what the reader is meant to take from ' +
        'it, so the import pipeline has both a real text layer to anchor to and a ' +
        'figure to crop and place inline beside that text.',
    );
    doc.image(makeFigurePng(0), MARGIN, doc.y, { width: 320 });
    doc.y += 210;
    doc.x = MARGIN;
    caption(doc, 'Figure 1. A schematic block diagram.');
    body(
      doc,
      'The block diagram above shows how three components pass data from one ' +
        'stage to the next. Notice that the arrangement is strictly left to ' +
        'right: nothing in the diagram feeds backwards. The waveform plotted ' +
        'below, by contrast, is periodic, and its shape repeats at a fixed ' +
        'interval that can be measured directly off the page.',
    );
    doc.image(makeFigurePng(2), MARGIN, doc.y, { width: 320 });
    doc.y += 210;
    doc.x = MARGIN;
    caption(doc, 'Figure 2. A plotted periodic waveform.');

    doc.addPage();
    body(
      doc,
      'A larger illustration can occupy most of a page when the detail genuinely ' +
        'matters. The figure below overlaps two fields so that the region where ' +
        'they interact is visible at a glance. When a figure is this large, the ' +
        'caption and the paragraph that introduces it do most of the work of ' +
        'telling the reader where to look first.',
    );
    doc.image(makeFigurePng(1), MARGIN, doc.y, { width: 420 });
    doc.y += 270;
    doc.x = MARGIN;
    caption(doc, 'Figure 3. Two overlapping fields, drawn to scale.');
    body(
      doc,
      'Taken together, the three figures move from the abstract to the concrete. ' +
        'The first is a structural sketch, the second is a measurement, and the ' +
        'third is a spatial map. Study notes that mix figures and prose like this ' +
        'are exactly the case the structured importer is built to handle well.',
    );
  });
}

/** Scanned fixture — full-page images, NO text layer. */
function scanned(): Promise<Buffer> {
  const page1 = makeScannedPagePng('Field Notebook — Page 1', [
    'These notes were written by hand and later scanned to a',
    'flat image. No selectable text layer exists in the file,',
    'so the import pipeline must transcribe from the picture.',
    '',
    'The structure engine should still recover a heading and',
    'several paragraphs from what it can read in the image.',
    '',
    'Observation: the tide reached the marked stone at noon.',
  ]);
  const page2 = makeScannedPagePng('Field Notebook — Page 2', [
    'A second scanned sheet continues the record. Lines of',
    'text sit on an off-white background to mimic real paper.',
    '',
    'Observation: cloud cover increased through the afternoon',
    'and the temperature fell by roughly four degrees.',
  ]);
  return renderPdf((doc) => {
    doc.image(page1, 0, 0, { width: PAGE_W, height: PAGE_H });
    doc.addPage();
    doc.image(page2, 0, 0, { width: PAGE_W, height: PAGE_H });
  });
}

/** Non-ASCII fixture — German umlauts and the eszett. */
function german(): Promise<Buffer> {
  return renderPdf((doc) => {
    heading(doc, 'Die Photosynthese im Überblick', 1);
    heading(doc, 'Einführung', 2);
    body(
      doc,
      'Die Photosynthese ist der Prozess, mit dem grüne Pflanzen Lichtenergie ' +
        'in chemische Energie umwandeln. Dabei entstehen Zucker und Sauerstoff, ' +
        'während Kohlendioxid und Wasser verbraucht werden.',
    );
    heading(doc, 'Ablauf', 2);
    body(
      doc,
      'Man unterscheidet die Lichtreaktion und die Dunkelreaktion. Die Größe ' +
        'der Blätter und ihre Stellung zur Sonne beeinflussen, wie viel Energie ' +
        'aufgenommen werden kann. Bei großer Hitze schließen viele Pflanzen ' +
        'ihre Spaltöffnungen, um den Wasserverlust zu verringern.',
    );
    body(
      doc,
      'Zusammenfassend lässt sich sagen: ohne Photosynthese gäbe es weder ' +
        'Nahrung noch atembare Luft. Sie ist die Grundlage fast aller Ökosysteme.',
    );
  });
}

/**
 * Oversize fixture — exactly 200 pages, used to prove the assembler's
 * truncation guard. Each page carries a heading and three paragraphs:
 * dense enough that the assembled document crosses the ~460 KB cap, but
 * short enough to never overflow one physical page (which would push the
 * count past 200).
 */
function giant200p(): Promise<Buffer> {
  return renderPdf((doc) => {
    for (let pageIndex = 0; pageIndex < 200; pageIndex += 1) {
      if (pageIndex > 0) doc.addPage();
      heading(doc, `Section ${pageIndex + 1}`, 2);
      for (let p = 0; p < 3; p += 1) {
        body(doc, paragraphOf(820, pageIndex * 3 + p));
      }
    }
  });
}

/** Encrypted fixture — opening it needs a user password. */
function encrypted(): Promise<Buffer> {
  return renderPdf(
    (doc) => {
      heading(doc, 'Confidential Notes', 1);
      body(
        doc,
        'This document is protected by a user password. A reader without the ' +
          'password cannot open it, and the import pipeline must report that ' +
          'clearly instead of crashing.',
      );
    },
    { userPassword: 'open-sesame', ownerPassword: 'owner-key', pdfVersion: '1.7' },
  );
}

/** Corrupt fixture — a PDF header followed by unparseable bytes. */
function corrupt(): Buffer {
  const header = Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1');
  const garbage = Buffer.alloc(900);
  for (let i = 0; i < garbage.length; i += 1) {
    garbage[i] = (i * 31 + 7) % 256;
  }
  return Buffer.concat([header, garbage]);
}

// --- main -------------------------------------------------------------------

async function main(): Promise<void> {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const fixtures: Array<[string, Buffer]> = [
    ['clean-text.pdf', await cleanText()],
    ['multi-column.pdf', await multiColumn()],
    ['callout-heavy.pdf', await calloutHeavy()],
    ['table-heavy.pdf', await tableHeavy()],
    ['image-heavy.pdf', await imageHeavy()],
    ['scanned.pdf', await scanned()],
    ['german.pdf', await german()],
    ['giant-200p.pdf', await giant200p()],
    ['encrypted.pdf', await encrypted()],
    ['corrupt.pdf', corrupt()],
  ];

  for (const [name, buffer] of fixtures) {
    writeFileSync(join(FIXTURE_DIR, name), buffer);
    const kb = (buffer.length / 1024).toFixed(1);
    console.log(`  ${name.padEnd(20)} ${kb.padStart(8)} KB`);
  }
  console.log(`\nWrote ${fixtures.length} fixtures to ${FIXTURE_DIR}`);
}

main().catch((err) => {
  console.error('fixture generation failed:', err);
  process.exit(1);
});
