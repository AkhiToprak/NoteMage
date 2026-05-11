import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('probe') !== '1') {
    return new NextResponse('Not Found', { status: 404 });
  }
  const raw = process.env.SIGNUP_BYPASS_TOKEN;
  const set = typeof raw === 'string' && raw.length > 0;
  return NextResponse.json(
    {
      runtime: 'edge',
      set,
      length: raw?.length ?? 0,
      starts: set ? raw!.slice(0, 4) : null,
      ends: set && raw!.length > 4 ? raw!.slice(-4) : null,
      has_whitespace: set ? /\s/.test(raw!) : false,
      wrapped_in_quotes:
        set && ((raw!.startsWith('"') && raw!.endsWith('"')) ||
          (raw!.startsWith("'") && raw!.endsWith("'"))),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
