#!/usr/bin/env node
// Copies pdfjs-dist's worker file into our source tree so that Next's
// file tracer (@vercel/nft) picks it up via the new URL(...) reference
// in src/lib/pdfjs-node.ts. Without this step the worker is loaded by
// pdfjs-dist via a dynamic import() that nft cannot analyse, and the
// serverless bundle ships without it — breaking every PDF import.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const src = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
const destDir = path.resolve(__dirname, '..', 'src', 'lib', 'vendor');
const dest = path.join(destDir, 'pdfjs-worker.mjs');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
// eslint-disable-next-line no-console
console.log(`[copy-pdf-worker] ${src} → ${dest}`);
