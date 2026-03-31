import JSZip from 'jszip';

export interface PptxImage {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface PptxSlide {
  slideNumber: number;
  title: string;
  textContent: string;
  images: PptxImage[];
}

const MAX_SLIDES = 200;
const MAX_TOTAL_EXTRACTED_SIZE = 200 * 1024 * 1024; // 200MB total extracted limit
const MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024; // 50MB per extracted file

/**
 * Determine MIME type from file extension.
 */
function mimeFromExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    emf: 'image/emf',
    wmf: 'image/wmf',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Extract all <a:t>...</a:t> text nodes from OOXML slide content.
 */
function extractTextNodes(xml: string): string[] {
  const results: string[] = [];
  const regex = /<a:t>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
}

/**
 * Extract image relationship IDs referenced in the slide XML via <a:blip r:embed="rIdN"/>.
 */
function extractImageRelIds(xml: string): string[] {
  const ids: string[] = [];
  const regex = /r:embed="(rId\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/**
 * Parse a .rels XML file and return a map of rId -> target path.
 */
function parseRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  const regex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"[^>]*\/>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(relsXml)) !== null) {
    map.set(match[1], match[2]);
  }
  return map;
}

/**
 * Get sorted slide file names from the ZIP.
 * Looks for ppt/slides/slide1.xml, slide2.xml, etc. and sorts numerically.
 */
function getSortedSlideNames(zip: JSZip): string[] {
  const slideNames: string[] = [];
  zip.forEach((relativePath) => {
    const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/);
    if (match) {
      slideNames.push(relativePath);
    }
  });
  slideNames.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/)![1], 10);
    const numB = parseInt(b.match(/slide(\d+)\.xml/)![1], 10);
    return numA - numB;
  });
  return slideNames;
}

/**
 * Resolve a relative target path from a rels file to an absolute ZIP path.
 * For example, target="../media/image1.png" from "ppt/slides/_rels/slide1.xml.rels"
 * resolves to "ppt/media/image1.png".
 */
function resolveRelTarget(relsFilePath: string, target: string): string | null {
  // Reject targets with null bytes or absolute paths
  if (target.includes('\0') || target.startsWith('/') || target.startsWith('\\')) {
    return null;
  }

  // Get the directory of the slide file (not the rels file)
  // relsFilePath is like "ppt/slides/_rels/slide1.xml.rels"
  // The relationships are relative to "ppt/slides/"
  const slideDir = relsFilePath.replace(/_rels\/[^/]+$/, '');
  const parts = (slideDir + target).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      if (resolved.length === 0) return null; // Would escape archive root
      resolved.pop();
    } else if (part !== '.' && part !== '') {
      resolved.push(part);
    }
  }

  const result = resolved.join('/');
  // Final safety check: reject if the path still contains traversal sequences
  if (result.includes('..') || result.startsWith('/')) return null;
  return result;
}

/**
 * Parse a PPTX file buffer and extract slides with text and images.
 */
export async function parsePptxFile(buffer: Buffer): Promise<PptxSlide[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = getSortedSlideNames(zip);
  const slides: PptxSlide[] = [];
  let totalExtractedSize = 0;

  const limitedSlideNames = slideNames.slice(0, MAX_SLIDES);

  for (let i = 0; i < limitedSlideNames.length; i++) {
    const slidePath = limitedSlideNames[i];
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;

    const slideXml = await slideFile.async('string');
    totalExtractedSize += Buffer.byteLength(slideXml, 'utf8');
    if (totalExtractedSize > MAX_TOTAL_EXTRACTED_SIZE) {
      throw new Error('PPTX file exceeds maximum decompressed size limit');
    }

    // Extract text content
    const textNodes = extractTextNodes(slideXml);
    const textContent = textNodes.join(' ').trim();

    // Use the first text node as title, or fall back to "Slide N"
    const slideNumber = i + 1;
    const title = textNodes.length > 0 ? textNodes[0].trim().slice(0, 200) : `Slide ${slideNumber}`;

    // Extract images
    const images: PptxImage[] = [];
    const imageRelIds = extractImageRelIds(slideXml);

    if (imageRelIds.length > 0) {
      // Read the rels file for this slide
      const slideFileName = slidePath.split('/').pop()!;
      const relsPath = `ppt/slides/_rels/${slideFileName}.rels`;
      const relsFile = zip.file(relsPath);

      if (relsFile) {
        const relsXml = await relsFile.async('string');
        const relsMap = parseRels(relsXml);

        for (const relId of imageRelIds) {
          const target = relsMap.get(relId);
          if (!target) continue;

          const resolvedPath = resolveRelTarget(relsPath, target);
          if (!resolvedPath) continue; // Reject path traversal attempts
          const imageFile = zip.file(resolvedPath);
          if (!imageFile) continue;

          const imageBuffer = Buffer.from(await imageFile.async('arraybuffer'));
          if (imageBuffer.length > MAX_SINGLE_FILE_SIZE) continue; // Skip oversized files
          totalExtractedSize += imageBuffer.length;
          if (totalExtractedSize > MAX_TOTAL_EXTRACTED_SIZE) {
            throw new Error('PPTX file exceeds maximum decompressed size limit');
          }

          const fileName = resolvedPath.split('/').pop() || `image_${relId}.png`;
          const mimeType = mimeFromExtension(fileName);

          images.push({ fileName, mimeType, buffer: imageBuffer });
        }
      }
    }

    slides.push({
      slideNumber,
      title,
      textContent,
      images,
    });
  }

  return slides;
}
