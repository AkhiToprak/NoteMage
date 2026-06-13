import { NextRequest, NextResponse } from 'next/server';

// Edge-safe (pure string + next/server only) so it can be used from middleware.

function rateLimitedHtml(seconds: number): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Slow down a moment</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0c0a1a; color: #eeecff; padding: 24px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .card {
    width: 100%; max-width: 440px; background: #121222;
    border: 1px solid rgba(174,137,255,0.18); border-radius: 24px;
    padding: 40px 32px; text-align: center; box-shadow: 0 32px 64px -12px rgba(0,0,0,0.5);
  }
  .icon {
    width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 9999px;
    display: flex; align-items: center; justify-content: center; background: rgba(174,137,255,0.12);
  }
  h1 { margin: 0 0 12px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  p { margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #c0bed8; }
  .count { font-size: 14px; margin: 0 0 24px; }
  .count b { color: #ae89ff; font-variant-numeric: tabular-nums; }
  button {
    appearance: none; border: none; cursor: pointer; font: inherit; font-weight: 700; font-size: 15px;
    background: #ae89ff; color: #2a0066; padding: 13px 28px; border-radius: 14px;
    box-shadow: 0 8px 24px rgba(174,137,255,0.25); transition: transform .2s, box-shadow .2s;
  }
  button:hover { transform: translateY(-1px); box-shadow: 0 12px 32px rgba(174,137,255,0.35); }
  button:active { transform: translateY(0); }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ae89ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
    </div>
    <h1>Whoa, slow down a sec</h1>
    <p>You're sending requests a little faster than our safety limit allows. Nothing's wrong with your account &mdash; this is automatic. Give it a moment and you'll be right back in.</p>
    <p class="count" id="msg">You can try again in <b id="cd">${seconds}</b>s.</p>
    <button id="retry" type="button" onclick="location.reload()">Try again</button>
  </div>
  <script>
    (function () {
      var s = ${seconds};
      var cd = document.getElementById('cd');
      var msg = document.getElementById('msg');
      var t = setInterval(function () {
        s -= 1;
        if (s <= 0) { clearInterval(t); msg.textContent = 'Reloading…'; location.reload(); return; }
        cd.textContent = String(s);
      }, 1000);
    })();
  </script>
</body>
</html>`;
}

/**
 * 429 response for the global per-IP throttle. API/fetch callers (the SPA and
 * native shell) get JSON they can parse; a top-level page navigation gets a
 * small branded "slow down" page with a live countdown — so a user who trips
 * the limit by clicking fast sees a friendly screen, not raw JSON.
 */
export function rateLimitedResponse(request: NextRequest, retryAfterMs?: number): NextResponse {
  const seconds = Math.min(300, Math.max(1, Math.ceil((retryAfterMs ?? 60_000) / 1000)));
  const accept = request.headers.get('accept') ?? '';
  const fetchMode = request.headers.get('sec-fetch-mode');
  // Browsers set sec-fetch-mode=navigate only on top-level navigations; fetch/
  // XHR send cors/same-origin. Fall back to the Accept header for older clients.
  const isNavigation = fetchMode === 'navigate' || (!fetchMode && accept.includes('text/html'));

  if (!isNavigation) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests', retryAfterSeconds: seconds },
      { status: 429, headers: { 'Retry-After': String(seconds) } }
    );
  }
  return new NextResponse(rateLimitedHtml(seconds), {
    status: 429,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Retry-After': String(seconds) },
  });
}
