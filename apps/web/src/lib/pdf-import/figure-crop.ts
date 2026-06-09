import { createCanvas, loadImage } from '@napi-rs/canvas';

/**
 * A figure's location on a page as a normalized `[x0, y0, x1, y1]` box,
 * each value in 0–1. This is the shape the structure engine emits on an
 * `image` block's `bbox` (see `doc-model.ts`).
 */
export type NormalizedBbox = readonly [number, number, number, number];

/** Pixels of breathing room added around the model's bbox on every side. */
const PADDING_PX = 8;

/**
 * Minimum width AND height, in page pixels, for a crop to be kept. The
 * vision model occasionally boxes an icon, bullet glyph, or rule as a
 * figure; anything below this is dropped as noise rather than inserted
 * as a tiny image. Measured on the *unpadded* box so padding can't lift
 * an icon over the bar.
 */
const MIN_CROP_PX = 48;

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Crop a figure region out of a rendered page PNG.
 *
 * The structure engine returns figures as normalized bounding boxes
 * rather than extracted bitmaps — embedded-image extraction has no
 * reliable page position (see the rebuild plan). The import worker
 * therefore renders each PDF page to a PNG and calls this to slice the
 * boxed region back out, padded slightly so nothing is clipped.
 *
 * Returns `null` when the boxed region is smaller than the icon-noise
 * threshold or degenerate (zero area) — the caller drops the figure.
 * Throws only when `pagePng` cannot be decoded as an image, which the
 * caller treats as a per-figure failure.
 */
export async function cropFigure(
  pagePng: Buffer,
  bbox: NormalizedBbox,
): Promise<Buffer | null> {
  const image = await loadImage(pagePng);
  const pageW = image.width;
  const pageH = image.height;
  if (pageW <= 0 || pageH <= 0) return null;

  // Scale rescue — the contract is 0–1 fractions, but models drift into
  // percent (0–100), Gemini's native 0–1000 detection grid, or pixel
  // coordinates — and they drift PER AXIS (observed live: fractional x
  // values alongside 0–1000-grid y values in one bbox). Clamping those to
  // 0–1 collapses the box to zero area and silently loses the figure, so
  // classify each axis pair independently and divide instead.
  const rescalePair = (a: number, b: number, pageDim: number): [number, number] => {
    const max = Math.max(Math.abs(a), Math.abs(b));
    if (max <= 1) return [a, b];
    if (max <= 100) return [a / 100, b / 100];
    if (max <= 1000) return [a / 1000, b / 1000];
    return [a / pageDim, b / pageDim];
  };
  const [rx0, rx1] = rescalePair(bbox[0], bbox[2], pageW);
  const [ry0, ry1] = rescalePair(bbox[1], bbox[3], pageH);

  // Clamp into 0–1 and order the corners — the model may emit either.
  let [x0, y0, x1, y1] = [rx0, ry0, rx1, ry1].map(clamp01);
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];

  // The unpadded figure size in page pixels — what the noise filter judges.
  const figureW = Math.round((x1 - x0) * pageW);
  const figureH = Math.round((y1 - y0) * pageH);
  if (figureW < MIN_CROP_PX || figureH < MIN_CROP_PX) {
    console.warn(
      `[pdf-import] figure crop dropped: ${figureW}x${figureH}px below ${MIN_CROP_PX}px floor`,
      { bbox, pageW, pageH },
    );
    return null;
  }

  // Padded crop rect, clamped to the page edges.
  const left = Math.max(0, Math.round(x0 * pageW) - PADDING_PX);
  const top = Math.max(0, Math.round(y0 * pageH) - PADDING_PX);
  const right = Math.min(pageW, Math.round(x1 * pageW) + PADDING_PX);
  const bottom = Math.min(pageH, Math.round(y1 * pageH) + PADDING_PX);
  const cropW = right - left;
  const cropH = bottom - top;
  if (cropW <= 0 || cropH <= 0) {
    console.warn('[pdf-import] figure crop dropped: degenerate crop rect', {
      bbox,
      pageW,
      pageH,
    });
    return null;
  }

  const canvas = createCanvas(cropW, cropH);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, left, top, cropW, cropH, 0, 0, cropW, cropH);
  return canvas.encode('png');
}
