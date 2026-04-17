import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // The native bridge contract lives in @notemage/shared as raw .ts so
  // both Next (web) and Metro (mobile) consume the same source. Without
  // this hint Next would refuse to compile a non-bundled workspace pkg.
  transpilePackages: ['@notemage/shared'],
  serverExternalPackages: ['pdfjs-dist', '@napi-rs/canvas'],
  // Monorepo: trace from the workspace root so pnpm-hoisted packages
  // are reachable. The pdfjs-dist worker file is bundled via a
  // new URL(..., import.meta.url) reference in src/lib/pdfjs-node.ts
  // (the file itself is copied into src/lib/vendor/ by the prebuild
  // script), which @vercel/nft treats as a static asset dependency.
  outputFileTracingRoot: path.join(__dirname, '../../'),
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
