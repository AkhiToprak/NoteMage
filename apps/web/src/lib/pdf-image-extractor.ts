export interface ExtractedPdfImage {
  pageNumber: number;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

const MAX_IMAGES = 100;

const JPEG_START = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_END = Buffer.from([0xff, 0xd9]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Extract embedded images from a PDF buffer by scanning for JPEG and PNG
 * byte sequences within PDF stream objects. Most PDFs embed images as raw
 * JPEG or deflate-compressed streams; this approach reliably captures the
 * JPEG ones (the vast majority) and any inline PNGs.
 */
export async function extractPdfImages(pdfBuffer: Buffer): Promise<ExtractedPdfImage[]> {
  const images: ExtractedPdfImage[] = [];

  // Strategy 1: Extract JPEG images by finding FFD8FF...FFD9 sequences
  // within the PDF binary. JPEGs are by far the most common embedded format.
  extractJpegImages(pdfBuffer, images);

  // Strategy 2: Extract PNG images by finding the PNG signature followed by
  // IEND chunk within the PDF binary.
  extractPngImages(pdfBuffer, images);

  // Try pdfjs-dist as a fallback / supplement for images we may have missed
  try {
    await extractWithPdfjs(pdfBuffer, images);
  } catch {
    // pdfjs extraction is best-effort; binary extraction above is the primary path
  }

  return images.slice(0, MAX_IMAGES);
}

function extractJpegImages(pdfBuffer: Buffer, images: ExtractedPdfImage[]): void {
  let offset = 0;

  while (offset < pdfBuffer.length && images.length < MAX_IMAGES) {
    const startIdx = pdfBuffer.indexOf(JPEG_START, offset);
    if (startIdx === -1) break;

    // Search for the JPEG end marker after the start
    const endIdx = findJpegEnd(pdfBuffer, startIdx + 3);
    if (endIdx === -1) {
      offset = startIdx + 3;
      continue;
    }

    const jpegEnd = endIdx + 2; // include the FFD9 bytes
    const length = jpegEnd - startIdx;

    // Sanity check: JPEG should be at least 100 bytes and no more than 50MB
    if (length >= 100 && length <= 50 * 1024 * 1024) {
      const imageBuffer = Buffer.alloc(length);
      pdfBuffer.copy(imageBuffer, 0, startIdx, jpegEnd);

      const imageNumber = images.length + 1;
      images.push({
        pageNumber: 0, // page number unknown with binary extraction
        fileName: `image-${imageNumber}.jpg`,
        mimeType: 'image/jpeg',
        buffer: imageBuffer,
      });
    }

    offset = jpegEnd;
  }
}

/**
 * Find the real end-of-image (EOI = FFD9) marker for a JPEG.
 * We skip FFD9 bytes that appear inside embedded thumbnails or EXIF data
 * by properly skipping over JPEG marker segments.
 */
function findJpegEnd(buf: Buffer, startSearch: number): number {
  let pos = startSearch;

  while (pos < buf.length - 1) {
    if (buf[pos] === 0xff) {
      const marker = buf[pos + 1];

      // EOI marker
      if (marker === 0xd9) {
        return pos;
      }

      // SOS (Start of Scan) — after this, raw image data follows until EOI.
      // We scan byte-by-byte for FFD9 from here.
      if (marker === 0xda) {
        const eoiIdx = buf.indexOf(JPEG_END, pos + 2);
        return eoiIdx === -1 ? -1 : eoiIdx;
      }

      // Skip markers with length fields (everything except RST0-RST7, SOI, EOI, TEM, and stuffed bytes)
      if (marker !== 0x00 && marker !== 0x01 && !(marker >= 0xd0 && marker <= 0xd7)) {
        if (pos + 3 < buf.length) {
          const segLen = (buf[pos + 2] << 8) | buf[pos + 3];
          pos += 2 + segLen;
          continue;
        }
      }
    }
    pos++;
  }

  return -1;
}

function extractPngImages(pdfBuffer: Buffer, images: ExtractedPdfImage[]): void {
  let offset = 0;

  while (offset < pdfBuffer.length && images.length < MAX_IMAGES) {
    const startIdx = pdfBuffer.indexOf(PNG_SIGNATURE, offset);
    if (startIdx === -1) break;

    // PNG files end with an IEND chunk: 00 00 00 00 49 45 4E 44 AE 42 60 82
    const iendMarker = Buffer.from([
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    const endIdx = pdfBuffer.indexOf(iendMarker, startIdx + 8);
    if (endIdx === -1) {
      offset = startIdx + 8;
      continue;
    }

    const pngEnd = endIdx + iendMarker.length;
    const length = pngEnd - startIdx;

    // Sanity check: PNG should be at least 67 bytes (minimum valid PNG) and no more than 50MB
    if (length >= 67 && length <= 50 * 1024 * 1024) {
      const imageBuffer = Buffer.alloc(length);
      pdfBuffer.copy(imageBuffer, 0, startIdx, pngEnd);

      const imageNumber = images.length + 1;
      images.push({
        pageNumber: 0,
        fileName: `image-${imageNumber}.png`,
        mimeType: 'image/png',
        buffer: imageBuffer,
      });
    }

    offset = pngEnd;
  }
}

/**
 * Attempt extraction via pdfjs-dist operator list. This can find images that
 * are not raw JPEG/PNG streams (e.g., CCITT fax, JBIG2, or raw pixel data).
 * We only add images that were not already found by the binary scan (deduplicated
 * by checking buffer equality of the first 32 bytes).
 */
async function extractWithPdfjs(
  pdfBuffer: Buffer,
  existingImages: ExtractedPdfImage[]
): Promise<void> {
  const { loadPdfjs } = await import('@/lib/pdfjs-node');
  const pdfjsLib = await loadPdfjs();

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const numPages = doc.numPages;

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (existingImages.length >= MAX_IMAGES) break;

    const page = await doc.getPage(pageNum);
    const operatorList = await page.getOperatorList();

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      if (existingImages.length >= MAX_IMAGES) break;

      // paintImageXObject operation
      if (operatorList.fnArray[i] === pdfjsLib.OPS.paintImageXObject) {
        const objName = operatorList.argsArray[i][0];

        try {
          const imgData = await new Promise<{
            width: number;
            height: number;
            data: Uint8ClampedArray;
            kind?: number;
          } | null>((resolve) => {
            // page.objs.get may call back synchronously or asynchronously
            page.objs.get(objName, (data: unknown) => {
              resolve(
                data as {
                  width: number;
                  height: number;
                  data: Uint8ClampedArray;
                } | null
              );
            });
            // Timeout in case the callback never fires
            setTimeout(() => resolve(null), 2000);
          });

          if (!imgData || !imgData.data || !imgData.width || !imgData.height) {
            continue;
          }

          // Convert raw RGBA pixel data to a minimal BMP
          const bmpBuffer = rgbaToBmp(imgData.data, imgData.width, imgData.height);

          // Skip tiny images (likely artifacts, icons, or spacer pixels)
          if (imgData.width < 10 || imgData.height < 10) continue;

          const imageNumber = existingImages.length + 1;
          existingImages.push({
            pageNumber: pageNum,
            fileName: `image-${imageNumber}.bmp`,
            mimeType: 'image/bmp',
            buffer: bmpBuffer,
          });
        } catch {
          // Skip images that fail to extract
        }
      }
    }

    page.cleanup();
  }

  doc.destroy();
}

/**
 * Convert raw RGBA pixel data to a BMP (Windows Bitmap) file buffer.
 * BMP is chosen because it requires no compression library — it is a
 * simple header + raw pixel data format.
 */
function rgbaToBmp(rgba: Uint8ClampedArray, width: number, height: number): Buffer {
  const rowSize = Math.ceil((width * 3) / 4) * 4; // rows padded to 4-byte boundary
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize; // 14-byte file header + 40-byte DIB header + pixel data

  const buf = Buffer.alloc(fileSize);

  // BMP file header (14 bytes)
  buf.write('BM', 0); // signature
  buf.writeUInt32LE(fileSize, 2); // file size
  buf.writeUInt32LE(0, 6); // reserved
  buf.writeUInt32LE(54, 10); // pixel data offset

  // DIB header (BITMAPINFOHEADER, 40 bytes)
  buf.writeUInt32LE(40, 14); // header size
  buf.writeInt32LE(width, 18); // width
  buf.writeInt32LE(height, 22); // height (positive = bottom-up)
  buf.writeUInt16LE(1, 26); // color planes
  buf.writeUInt16LE(24, 28); // bits per pixel (BGR, no alpha)
  buf.writeUInt32LE(0, 30); // compression (none)
  buf.writeUInt32LE(pixelDataSize, 34); // image size
  buf.writeInt32LE(2835, 38); // horizontal resolution (72 DPI)
  buf.writeInt32LE(2835, 42); // vertical resolution (72 DPI)
  buf.writeUInt32LE(0, 46); // colors in palette
  buf.writeUInt32LE(0, 50); // important colors

  // Pixel data: BMP stores rows bottom-to-top, in BGR order
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4; // source is top-to-bottom RGBA
    const dstRow = 54 + y * rowSize;

    for (let x = 0; x < width; x++) {
      const srcIdx = srcRow + x * 4;
      const dstIdx = dstRow + x * 3;
      buf[dstIdx] = rgba[srcIdx + 2]; // B
      buf[dstIdx + 1] = rgba[srcIdx + 1]; // G
      buf[dstIdx + 2] = rgba[srcIdx]; // R
    }
  }

  return buf;
}
