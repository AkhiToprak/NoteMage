import PptxGenJS from 'pptxgenjs';

export interface SlideData {
  title: string;
  content: string;
  notes?: string;
}

// Purple accent #8c52ff, dark background #181732, text #ede9ff
const BRAND_COLORS = {
  bg: '0d0c20',
  accent: '8c52ff',
  text: 'ede9ff',
  subtext: 'a09cb5',
};

export async function generateFlashcardPptx(
  setTitle: string,
  flashcards: { question: string; answer: string }[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Notemage';
  pptx.title = setTitle;

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: BRAND_COLORS.bg };
  titleSlide.addText(setTitle, {
    x: 0.5,
    y: 2.0,
    w: '90%',
    fontSize: 36,
    color: BRAND_COLORS.text,
    bold: true,
    align: 'center',
  });
  titleSlide.addText(`${flashcards.length} Flashcards`, {
    x: 0.5,
    y: 3.2,
    w: '90%',
    fontSize: 18,
    color: BRAND_COLORS.subtext,
    align: 'center',
  });

  // Each card gets 2 slides (question + answer)
  for (let i = 0; i < flashcards.length; i++) {
    const fc = flashcards[i];

    // Question slide
    const qSlide = pptx.addSlide();
    qSlide.background = { color: BRAND_COLORS.bg };
    qSlide.addText(`Card ${i + 1} / ${flashcards.length}`, {
      x: 0.5,
      y: 0.3,
      w: '90%',
      fontSize: 12,
      color: BRAND_COLORS.subtext,
    });
    qSlide.addText('Question', {
      x: 0.5,
      y: 0.7,
      w: '90%',
      fontSize: 14,
      color: BRAND_COLORS.accent,
      bold: true,
    });
    qSlide.addText(fc.question, {
      x: 0.5,
      y: 1.2,
      w: '90%',
      h: 4,
      fontSize: 24,
      color: BRAND_COLORS.text,
      valign: 'middle',
      align: 'center',
    });

    // Answer slide
    const aSlide = pptx.addSlide();
    aSlide.background = { color: BRAND_COLORS.bg };
    aSlide.addText(`Card ${i + 1} / ${flashcards.length}`, {
      x: 0.5,
      y: 0.3,
      w: '90%',
      fontSize: 12,
      color: BRAND_COLORS.subtext,
    });
    aSlide.addText('Answer', {
      x: 0.5,
      y: 0.7,
      w: '90%',
      fontSize: 14,
      color: BRAND_COLORS.accent,
      bold: true,
    });
    aSlide.addText(fc.answer, {
      x: 0.5,
      y: 1.2,
      w: '90%',
      h: 4,
      fontSize: 20,
      color: BRAND_COLORS.text,
      valign: 'middle',
      align: 'center',
    });
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}

export async function generateQuizPptx(
  setTitle: string,
  questions: { question: string; options: string[]; correctIndex: number; hint?: string | null }[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Notemage';
  pptx.title = setTitle;

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: BRAND_COLORS.bg };
  titleSlide.addText(setTitle, {
    x: 0.5,
    y: 2.0,
    w: '90%',
    fontSize: 36,
    color: BRAND_COLORS.text,
    bold: true,
    align: 'center',
  });
  titleSlide.addText(`${questions.length} Questions`, {
    x: 0.5,
    y: 3.2,
    w: '90%',
    fontSize: 18,
    color: BRAND_COLORS.subtext,
    align: 'center',
  });

  const OPTION_LABELS = ['A', 'B', 'C', 'D'];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const slide = pptx.addSlide();
    slide.background = { color: BRAND_COLORS.bg };

    slide.addText(`Question ${i + 1} / ${questions.length}`, {
      x: 0.5,
      y: 0.3,
      w: '90%',
      fontSize: 12,
      color: BRAND_COLORS.subtext,
    });
    slide.addText(q.question, {
      x: 0.5,
      y: 0.8,
      w: '90%',
      fontSize: 22,
      color: BRAND_COLORS.text,
      bold: true,
    });

    // Options
    q.options.forEach((opt, j) => {
      slide.addText(`${OPTION_LABELS[j]}.  ${opt}`, {
        x: 1.0,
        y: 2.2 + j * 0.8,
        w: '80%',
        fontSize: 18,
        color: BRAND_COLORS.text,
      });
    });

    // Speaker notes with correct answer
    slide.addNotes(
      `Correct answer: ${OPTION_LABELS[q.correctIndex]}. ${q.options[q.correctIndex]}${q.hint ? `\nHint: ${q.hint}` : ''}`
    );
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}

export async function generatePagesPptx(
  notebookTitle: string,
  pages: { title: string; textContent: string }[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Notemage';
  pptx.title = notebookTitle;

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: BRAND_COLORS.bg };
  titleSlide.addText(notebookTitle, {
    x: 0.5,
    y: 2.0,
    w: '90%',
    fontSize: 36,
    color: BRAND_COLORS.text,
    bold: true,
    align: 'center',
  });
  titleSlide.addText(`${pages.length} Pages`, {
    x: 0.5,
    y: 3.2,
    w: '90%',
    fontSize: 18,
    color: BRAND_COLORS.subtext,
    align: 'center',
  });

  for (const page of pages) {
    const slide = pptx.addSlide();
    slide.background = { color: BRAND_COLORS.bg };
    slide.addText(page.title, {
      x: 0.5,
      y: 0.3,
      w: '90%',
      fontSize: 28,
      color: BRAND_COLORS.accent,
      bold: true,
    });
    // Truncate long text content to fit on a slide
    const truncatedContent = page.textContent.slice(0, 2000);
    slide.addText(truncatedContent, {
      x: 0.5,
      y: 1.2,
      w: '90%',
      h: 5.5,
      fontSize: 14,
      color: BRAND_COLORS.text,
      valign: 'top',
    });
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}

// ── Rich presentation slide types ──

export interface PresentationSlide {
  slideType: 'title' | 'content' | 'section_divider' | 'two_column' | 'conclusion';
  title: string;
  subtitle?: string;
  bullets?: string[];
  leftColumn?: { heading?: string; bullets: string[] };
  rightColumn?: { heading?: string; bullets: string[] };
  graphicDescription?: string;
  notes?: string;
}

/** Darken a hex color by mixing with black */
function darkenHex(hex: string, amount: number): string {
  const r = Math.round(parseInt(hex.substring(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(hex.substring(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(hex.substring(4, 6), 16) * (1 - amount));
  return [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Lighten a hex color by mixing with white */
function lightenHex(hex: string, amount: number): string {
  const r = Math.round(
    parseInt(hex.substring(0, 2), 16) + (255 - parseInt(hex.substring(0, 2), 16)) * amount
  );
  const g = Math.round(
    parseInt(hex.substring(2, 4), 16) + (255 - parseInt(hex.substring(2, 4), 16)) * amount
  );
  const b = Math.round(
    parseInt(hex.substring(4, 6), 16) + (255 - parseInt(hex.substring(4, 6), 16)) * amount
  );
  return [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

export async function generatePresentationPptx(
  presTitle: string,
  themeColor: string,
  slides: PresentationSlide[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.33" × 7.5"
  pptx.author = 'Notemage';
  pptx.title = presTitle;

  const accent = themeColor.replace('#', '');
  const darkBg = darkenHex(accent, 0.75);
  const lightAccent = lightenHex(accent, 0.85);
  const body = '2D2D2D';
  const muted = '777777';
  const fontFace = 'Arial';

  for (const s of slides) {
    const slide = pptx.addSlide();

    switch (s.slideType) {
      case 'title': {
        slide.background = { color: darkBg };
        slide.addText(s.title, {
          x: 0.7,
          y: 1.8,
          w: 11.9,
          h: 2.0,
          fontSize: 36,
          fontFace,
          color: 'FFFFFF',
          bold: true,
          align: 'left',
          valign: 'top',
        });
        if (s.subtitle) {
          slide.addShape('rect' as PptxGenJS.ShapeType, {
            x: 0.7,
            y: 3.9,
            w: 2.0,
            h: 0.05,
            fill: { color: accent },
          });
          slide.addText(s.subtitle, {
            x: 0.7,
            y: 4.1,
            w: 11.9,
            h: 0.8,
            fontSize: 18,
            fontFace,
            color: lightenHex(accent, 0.6),
            align: 'left',
          });
        }
        break;
      }

      case 'section_divider': {
        slide.background = { color: darkBg };
        slide.addShape('rect' as PptxGenJS.ShapeType, {
          x: 0.7,
          y: 3.0,
          w: 1.5,
          h: 0.05,
          fill: { color: accent },
        });
        slide.addText(s.title, {
          x: 0.7,
          y: 3.2,
          w: 11.9,
          h: 1.5,
          fontSize: 32,
          fontFace,
          color: 'FFFFFF',
          bold: true,
          align: 'left',
          valign: 'top',
        });
        if (s.subtitle) {
          slide.addText(s.subtitle, {
            x: 0.7,
            y: 4.6,
            w: 11.9,
            h: 0.6,
            fontSize: 16,
            fontFace,
            color: lightenHex(accent, 0.5),
            align: 'left',
          });
        }
        break;
      }

      case 'conclusion': {
        slide.background = { color: darkBg };
        slide.addText(s.title, {
          x: 0.7,
          y: 0.5,
          w: 11.9,
          h: 1.0,
          fontSize: 28,
          fontFace,
          color: 'FFFFFF',
          bold: true,
          align: 'left',
        });
        slide.addShape('rect' as PptxGenJS.ShapeType, {
          x: 0.7,
          y: 1.4,
          w: 2.0,
          h: 0.04,
          fill: { color: accent },
        });
        if (s.bullets && s.bullets.length > 0) {
          slide.addText(
            s.bullets.map((b) => ({ text: b, options: { bullet: true, color: 'FFFFFF' } })),
            {
              x: 0.7,
              y: 1.8,
              w: 11.9,
              h: 4.5,
              fontSize: 20,
              fontFace,
              color: 'E0E0E0',
              lineSpacingMultiple: 1.5,
              valign: 'top',
            }
          );
        }
        break;
      }

      case 'two_column': {
        slide.background = { color: 'FFFFFF' };
        // Title with accent rule
        slide.addText(s.title, {
          x: 0.5,
          y: 0.3,
          w: 12.3,
          h: 0.9,
          fontSize: 22,
          fontFace,
          color: darkenHex(accent, 0.3),
          bold: true,
          align: 'left',
          valign: 'top',
        });
        slide.addShape('rect' as PptxGenJS.ShapeType, {
          x: 0.5,
          y: 1.15,
          w: 12.3,
          h: 0.03,
          fill: { color: lightenHex(accent, 0.5) },
        });

        // Left column
        const leftX = 0.5;
        const colW = 5.8;
        if (s.leftColumn) {
          let ly = 1.5;
          if (s.leftColumn.heading) {
            slide.addText(s.leftColumn.heading, {
              x: leftX,
              y: ly,
              w: colW,
              h: 0.5,
              fontSize: 18,
              fontFace,
              color: accent,
              bold: true,
            });
            ly += 0.5;
          }
          slide.addText(
            s.leftColumn.bullets.map((b) => ({ text: b, options: { bullet: true, color: body } })),
            {
              x: leftX,
              y: ly,
              w: colW,
              h: 4.5,
              fontSize: 16,
              fontFace,
              color: body,
              lineSpacingMultiple: 1.4,
              valign: 'top',
            }
          );
        }

        // Vertical divider
        slide.addShape('rect' as PptxGenJS.ShapeType, {
          x: 6.55,
          y: 1.5,
          w: 0.03,
          h: 4.5,
          fill: { color: lightenHex(accent, 0.7) },
        });

        // Right column
        const rightX = 6.9;
        if (s.rightColumn) {
          let ry = 1.5;
          if (s.rightColumn.heading) {
            slide.addText(s.rightColumn.heading, {
              x: rightX,
              y: ry,
              w: colW,
              h: 0.5,
              fontSize: 18,
              fontFace,
              color: accent,
              bold: true,
            });
            ry += 0.5;
          }
          slide.addText(
            s.rightColumn.bullets.map((b) => ({ text: b, options: { bullet: true, color: body } })),
            {
              x: rightX,
              y: ry,
              w: colW,
              h: 4.5,
              fontSize: 16,
              fontFace,
              color: body,
              lineSpacingMultiple: 1.4,
              valign: 'top',
            }
          );
        }

        // Graphic placeholder if present
        if (s.graphicDescription) {
          slide.addShape('roundRect' as PptxGenJS.ShapeType, {
            x: 6.9,
            y: 4.5,
            w: 5.8,
            h: 2.2,
            rectRadius: 0.15,
            fill: { color: lightAccent },
            line: { color: lightenHex(accent, 0.4), width: 1 },
          });
          slide.addText(`[ ${s.graphicDescription} ]`, {
            x: 6.9,
            y: 4.5,
            w: 5.8,
            h: 2.2,
            fontSize: 12,
            fontFace,
            color: muted,
            align: 'center',
            valign: 'middle',
            italic: true,
          });
        }
        break;
      }

      case 'content':
      default: {
        slide.background = { color: 'FFFFFF' };

        // Action title
        slide.addText(s.title, {
          x: 0.5,
          y: 0.3,
          w: 12.3,
          h: 0.9,
          fontSize: 22,
          fontFace,
          color: darkenHex(accent, 0.3),
          bold: true,
          align: 'left',
          valign: 'top',
        });
        // Accent rule under title
        slide.addShape('rect' as PptxGenJS.ShapeType, {
          x: 0.5,
          y: 1.15,
          w: 12.3,
          h: 0.03,
          fill: { color: lightenHex(accent, 0.5) },
        });

        // Determine layout: with or without graphic
        const hasGraphic = !!s.graphicDescription;
        const textW = hasGraphic ? 6.5 : 12.3;

        // Bullets
        if (s.bullets && s.bullets.length > 0) {
          slide.addText(
            s.bullets.map((b) => ({ text: b, options: { bullet: true, color: body } })),
            {
              x: 0.5,
              y: 1.5,
              w: textW,
              h: 5.0,
              fontSize: 18,
              fontFace,
              color: body,
              lineSpacingMultiple: 1.5,
              valign: 'top',
            }
          );
        }

        // Graphic placeholder
        if (hasGraphic) {
          slide.addShape('roundRect' as PptxGenJS.ShapeType, {
            x: 7.3,
            y: 1.5,
            w: 5.5,
            h: 4.5,
            rectRadius: 0.15,
            fill: { color: lightAccent },
            line: { color: lightenHex(accent, 0.4), width: 1 },
          });
          slide.addText(`[ ${s.graphicDescription} ]`, {
            x: 7.3,
            y: 1.5,
            w: 5.5,
            h: 4.5,
            fontSize: 13,
            fontFace,
            color: muted,
            align: 'center',
            valign: 'middle',
            italic: true,
          });

          // Small accent bar at top of graphic area
          slide.addShape('rect' as PptxGenJS.ShapeType, {
            x: 7.3,
            y: 1.5,
            w: 5.5,
            h: 0.06,
            fill: { color: accent },
          });
        }
        break;
      }
    }

    if (s.notes) {
      slide.addNotes(s.notes);
    }
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}

// Convert SlideData array to PPTX (used by slide editor)
export async function generateSlidesAsPptx(title: string, slides: SlideData[]): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Notemage';
  pptx.title = title;

  for (const slideData of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: BRAND_COLORS.bg };
    slide.addText(slideData.title, {
      x: 0.5,
      y: 0.3,
      w: '90%',
      fontSize: 28,
      color: BRAND_COLORS.accent,
      bold: true,
    });
    slide.addText(slideData.content, {
      x: 0.5,
      y: 1.2,
      w: '90%',
      h: 5.5,
      fontSize: 16,
      color: BRAND_COLORS.text,
      valign: 'top',
    });
    if (slideData.notes) {
      slide.addNotes(slideData.notes);
    }
  }

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}
