import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it, vi } from 'vitest';
import { cropFigure } from './figure-crop';

/** A 1000x800 white page PNG with a colored block at 100,100–600,500. */
async function makePagePng(): Promise<Buffer> {
  const canvas = createCanvas(1000, 800);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1000, 800);
  ctx.fillStyle = '#5170ff';
  ctx.fillRect(100, 100, 500, 400);
  return canvas.encode('png');
}

async function cropSize(crop: Buffer): Promise<{ w: number; h: number }> {
  const img = await loadImage(crop);
  return { w: img.width, h: img.height };
}

describe('cropFigure — bbox scale rescue', () => {
  it('crops a contract-conform fractional bbox', async () => {
    const png = await makePagePng();
    const crop = await cropFigure(png, [0.1, 0.125, 0.6, 0.625]);
    expect(crop).not.toBeNull();
    const { w, h } = await cropSize(crop!);
    // 500x400 region + 8px padding on each side
    expect(w).toBeGreaterThanOrEqual(500);
    expect(h).toBeGreaterThanOrEqual(400);
  });

  it('rescues a percent-scale bbox (0–100)', async () => {
    const png = await makePagePng();
    const crop = await cropFigure(png, [10, 12.5, 60, 62.5]);
    expect(crop).not.toBeNull();
    const { w } = await cropSize(crop!);
    expect(w).toBeGreaterThanOrEqual(500);
  });

  it('rescues a pixel-scale bbox (page coordinates)', async () => {
    const png = await makePagePng();
    const crop = await cropFigure(png, [100, 100, 600, 500]);
    expect(crop).not.toBeNull();
    const { w, h } = await cropSize(crop!);
    expect(w).toBeGreaterThanOrEqual(500);
    expect(h).toBeGreaterThanOrEqual(400);
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
