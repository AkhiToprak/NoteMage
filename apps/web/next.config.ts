import type { NextConfig } from 'next';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Copy pdfjs-dist's worker file into src/lib/vendor/ so that it can be
// referenced via new URL(..., import.meta.url) from pdfjs-node.ts and
// thereby picked up by @vercel/nft / Turbopack asset tracing. Done at
// config-load time so the worker is in place before Next scans files,
// regardless of how the build is invoked.
(function ensurePdfjsWorkerCopied() {
  try {
    const req = createRequire(path.join(__dirname, 'package.json'));
    const src = req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

    // Two destinations:
    //   - src/lib/vendor/ for the server path (referenced via new URL)
    //   - public/ for the client-side PDF → PNG renderer
    const targets = [
      path.join(__dirname, 'src', 'lib', 'vendor', 'pdfjs-worker.mjs'),
      path.join(__dirname, 'public', 'pdfjs-worker.mjs'),
    ];

    for (const dest of targets) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      let shouldCopy = true;
      if (fs.existsSync(dest)) {
        const srcStat = fs.statSync(src);
        const dstStat = fs.statSync(dest);
        shouldCopy = srcStat.mtimeMs > dstStat.mtimeMs || srcStat.size !== dstStat.size;
      }
      if (shouldCopy) {
        fs.copyFileSync(src, dest);
        // eslint-disable-next-line no-console
        console.log(`[next.config] Copied pdfjs worker → ${dest}`);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[next.config] Failed to copy pdfjs worker:', err);
  }
})();

const nextConfig: NextConfig = {
  // Standalone output bundles a minimal node_modules + server.js into
  // .next/standalone/, which the Dockerfile copies into a slim runner.
  output: 'standalone',
  // The native bridge contract lives in @notemage/shared as raw .ts so
  // both Next (web) and Metro (mobile) consume the same source. Without
  // this hint Next would refuse to compile a non-bundled workspace pkg.
  transpilePackages: ['@notemage/shared'],
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas', 'geoip-lite'],
  // Monorepo: trace from the workspace root so pnpm-hoisted packages
  // are reachable. The pdfjs-dist worker file is bundled via a
  // new URL(..., import.meta.url) reference in src/lib/pdfjs-node.ts
  // (the file itself is copied into src/lib/vendor/ by the prebuild
  // script), which @vercel/nft treats as a static asset dependency.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // geoip-lite reads its GeoLite2 .dat files from disk at runtime via fs, not
  // via import — so @vercel/nft can't infer them and the standalone build omits
  // them, which would break /api/currency. Force them into that route's trace.
  // (currencyFromIp also degrades to CHF if they're ever missing.)
  outputFileTracingIncludes: {
    '/api/currency': [
      './node_modules/geoip-lite/data/**',
      '../../node_modules/.pnpm/geoip-lite@*/node_modules/geoip-lite/data/**',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      // Google profile pictures (Continue with Google)
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      // Apple Sign In profile assets (when present)
      {
        protocol: 'https',
        hostname: 'appleid.cdn-apple.com',
      },
    ],
  },
  // Mage Revolution Phase 10 — the full-page chat at /learn/chats was folded
  // into the global Mage panel. Permanently redirect old bookmarks / deep-links
  // (and any stray link) into the panel via the ?mage=open flag (MageAutoOpen
  // reads it and opens the panel, then strips the param).
  async redirects() {
    return [
      { source: '/learn/chats', destination: '/dashboard?mage=open', permanent: true },
      { source: '/learn/chats/:path*', destination: '/dashboard?mage=open', permanent: true },
    ];
  },
  // Reverse-proxy PostHog through /ingest so ad blockers and Safari ITP
  // don't silently drop analytics events. The static/array rules MUST come
  // before the catch-all. EU region (PostHog Cloud).
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/array/:path*',
        destination: 'https://eu-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
    ];
  },
  // PostHog's ingestion endpoints use trailing slashes (e.g. /e/); without
  // this, Next.js 308-redirects them and breaks event capture.
  skipTrailingSlashRedirect: true,
};

let config: NextConfig = nextConfig;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withSentryConfig } = require('@sentry/nextjs');
  config = withSentryConfig(nextConfig, {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
  });
} catch {
  // @sentry/nextjs not available — skip Sentry integration
}

export default config;
