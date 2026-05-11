import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

async function sha256First16(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('probe') !== '1') {
    return new NextResponse('Not Found', { status: 404 });
  }
  const raw = process.env.SIGNUP_BYPASS_TOKEN;
  const set = typeof raw === 'string' && raw.length > 0;

  let envKeyCount = 0;
  let matchingKeys: string[] = [];
  try {
    const keys = Object.keys(process.env);
    envKeyCount = keys.length;
    matchingKeys = keys.filter((k) => /BYPASS|SIGNUP/i.test(k));
  } catch {
    // Edge runtime may restrict Object.keys on process.env in some builds.
  }

  return NextResponse.json(
    {
      runtime: 'edge',
      set,
      length: raw?.length ?? 0,
      starts: set ? raw!.slice(0, 4) : null,
      ends: set && raw!.length > 4 ? raw!.slice(-4) : null,
      has_whitespace: set ? /\s/.test(raw!) : false,
      wrapped_in_quotes:
        set &&
        ((raw!.startsWith('"') && raw!.endsWith('"')) ||
          (raw!.startsWith("'") && raw!.endsWith("'"))),
      sha256_first16: set ? await sha256First16(raw!) : null,
      env_key_count: envKeyCount,
      matching_keys: matchingKeys,
      marker: process.env.DEBUG_PROBE_MARKER ?? null,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
