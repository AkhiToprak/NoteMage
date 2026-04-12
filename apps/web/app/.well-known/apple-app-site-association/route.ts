// Serves the iOS universal-link manifest at
// https://notemage.app/.well-known/apple-app-site-association
//
// Apple requires this file to be:
//   * served over HTTPS without any redirects
//   * returned with Content-Type: application/json
//   * served WITHOUT the .json extension on the URL
//
// Next.js's `public/` folder can satisfy the first and third requirements,
// but it doesn't let us override the Content-Type for an extensionless file
// — Vercel's edge will guess `application/octet-stream`. The iOS Universal
// Links daemon (`swcd`) is fussy about MIME, so we use a route handler
// instead and set the header explicitly.
//
// Replace `TEAMID` below with the Apple Developer Team ID once the paid
// program is approved (Phase 2 prerequisite). The bundle identifier is
// fixed by `apps/mobile/app.json` → `ios.bundleIdentifier`.
//
// Apple caches this file aggressively. After deploying a change you may
// have to delete the app and reinstall before iOS re-fetches it.

import { NextResponse } from 'next/server';

const APP_ID = 'TEAMID.app.notemage.mobile';

// Cache-control: short. The file rarely changes but if you do change it
// (adding a new app, new path), you don't want a stale CDN copy floating
// around for hours.
export const dynamic = 'force-static';

export function GET(): NextResponse {
  const body = {
    applinks: {
      apps: [],
      details: [
        {
          appID: APP_ID,
          paths: [
            '/notebook/*',
            '/notebooks/*',
            '/auth/*',
            '/share/*',
            '/cowork/*',
            'NOT /api/*',
            'NOT /admin/*',
          ],
        },
      ],
    },
    // Web credential sharing — required so Sign in with Apple shared
    // keychain credentials work between the web site and the iOS app.
    webcredentials: {
      apps: [APP_ID],
    },
  };

  return new NextResponse(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
