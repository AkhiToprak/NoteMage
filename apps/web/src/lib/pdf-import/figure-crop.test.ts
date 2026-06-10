import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';
import { cropFigure } from './figure-crop';

/** A 1600x1200 white page PNG with a colored block at 200,150–1200,750. */
async function makePagePng(): Promise<Buffer> {
  const canvas = createCanvas(1600, 1200);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1600, 1200);
  ctx.fillStyle = '#5170ff';
  ctx.fillRect(200, 150, 1000, 600);
  return canvas.encode('png');
}

async function cropSize(crop: Buffer): Promise<{ w: number; h: number }> {
  const img = await loadImage(crop);
  return { w: img.width, h: img.height };
}

// The block region is 1000x600; every rescued bbox below describes that same
// region in a different coordinate scale, so each crop (plus 8px padding)
// must come back at least block-sized.
describe('cropFigure — per-axis bbox scale rescue', () => {
  it('crops a contract-conform fractional bbox', async () => {
    const png = await makePagePng();
    const crop = await cropFigure(png, [0.125, 0.125, 0.75, 0.625]);
    expect(crop).not.toBeNull();
    const { w, h } = await cropSize(crop!);
    expect(w).toBeGreaterThanOrEqual(1000);
    expect(h).toBeGreaterThanOrEqual(600);
  });

  it('rescues a percent-scale bbox (0–100)', async () => {
    const png = await makePagePng();
    const crop = await cropFigure(png, [12.5, 12.5, 75, 62.5]);
    expect(crop).not.toBeNull();
    const { w, h } = await cropSize(crop!);
    expect(w).toBeGreaterThanOrEqual(1000);
    expect(h).toBeGreaterThanOrEqual(600);
  });

  it('rescues a 0–1000-grid bbox (Gemini native)', async () => {
    const png = await makePagePng();
    const crop = await cropFigure(png, [125, 125, 750, 625]);
    expect(crop).not.toBeNull();
    const { w, h } = await cropSize(crop!);
    expect(w).toBeGreaterThanOrEqual(1000);
    expect(h).toBeGreaterThanOrEqual(600);
  });

  it('rescues mixed axes: fractional x with 0–1000-grid y (observed live)', async () => {
    const png = await makePagePng();
    const crop = await cropFigure(png, [0.125, 125, 0.75, 625]);
    expect(crop).not.toBeNull();
    const { w, h } = await cropSize(crop!);
    expect(w).toBeGreaterThanOrEqual(1000);
    expect(h).toBeGreaterThanOrEqual(600);
  });

  it('rescues a pixel-scale bbox (values beyond 1000)', async () => {
    const png = await makePagePng();
    const crop = await cropFigure(png, [200, 150, 1200, 750]);
    expect(crop).not.toBeNull();
    const { w, h } = await cropSize(crop!);
    expect(w).toBeGreaterThanOrEqual(1000);
    expect(h).toBeGreaterThanOrEqual(600);
  });

  it('returns null (with a warning) for a sub-threshold box', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const png = await makePagePng();
      const crop = await cropFigure(png, [0.5, 0.5, 0.51, 0.51]);
      expect(crop).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('returns null (with a warning) for a zero-area box', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const png = await makePagePng();
      const crop = await cropFigure(png, [1, 1, 1, 1]);
      expect(crop).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
