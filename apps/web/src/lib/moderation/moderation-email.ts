// Terminal-outcome emails for path moderation. Triggered by the L2/L3/L5
// runners on every state transition that's user-actionable (approve,
// reject, flag-for-human). Per AC-Moderate-8 these go out alongside the
// in-app Notification — same channel split as the rest of the product.
//
// Provider: Resend, same as `waitlist-email.ts`. The HTML follows the
// same brand pattern (purple anchor, dark surface, Plus Jakarta Sans /
// system font fallback) so the emails sit in the same visual family.
//
// All sends are wrapped in a try/catch that logs but doesn't throw —
// background moderation jobs must not be blocked by a transient email
// outage. The Notification row is the durable record; email is the
// nudge.
//
// Hallmark · component: transactional-email · genre: editorial
// states: rendered · sent · failed (logged)
// brand-locked tokens (palette mirrors apps/web/src/app/globals.css):
//   --ink   #eeecff   (primary text)
//   --paper #000000   (canvas)
//   --accent #ae89ff  (CTA + heading anchor)
//   --muted #c0bed8   (body)
//   --hair  #8888a8   (signature)

import { Resend } from 'resend';
import { describeModerationReason } from '../notification-utils';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || 'Notemage <noreply@notemage.app>';
}

function getAppOrigin() {
  return process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://notemage.app';
}

// Minimal entity-escape for the values we splat into HTML below. The
// publication title is author-controlled, so a fancy quote or "&" must
// not break the surrounding markup.
function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Identical chrome on every moderation email — only the body block
// changes. The shell is the brand-locked surface; body owns the voice.
function shell(opts: { preheader: string; bodyHtml: string }): string {
  const { preheader, bodyHtml } = opts;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Notemage</title>
  </head>
  <body style="margin:0; padding:0; background:#000000;">
    <!-- preheader (hidden, shown in inbox preview) -->
    <span style="display:none; max-height:0; overflow:hidden; opacity:0; visibility:hidden;">${htmlEscape(
      preheader,
    )}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px;">
            <tr>
              <td style="font-family:'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif; color:#eeecff; padding:0 8px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="font-family:'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif; color:#8888a8; font-size:12px; line-height:1.6; padding:32px 8px 0;">
                — Notemage moderation
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Approval email — fires when L2 returns `pass` (or L5 admin approves
 * out of the human queue, in P7).
 *
 * Per AC-Moderate-8 the user also gets an in-app `path_published`
 * notification; this email is the off-app nudge that completes the
 * "your work is live" feedback loop. Best-effort send; failures log
 * and do not throw.
 */
export async function sendPathApprovedEmail(opts: {
  to: string;
  title: string;
  shareId: string;
}): Promise<void> {
  try {
    const titleEsc = htmlEscape(opts.title);
    const url = `${getAppOrigin()}/learn/community/${encodeURIComponent(opts.shareId)}`;
    const body = `
      <h1 style="font-size:22px; font-weight:700; line-height:1.3; margin:0 0 16px; color:#ae89ff; letter-spacing:-0.01em;">
        Your path is live.
      </h1>
      <p style="font-size:16px; line-height:1.6; margin:0 0 12px; color:#eeecff;">
        <strong style="color:#eeecff;">${titleEsc}</strong> passed review and is now in the community library.
      </p>
      <p style="font-size:14px; line-height:1.6; margin:0 0 28px; color:#c0bed8;">
        Other learners can browse, rate, and clone it from here on out.
      </p>
      <a href="${url}" style="display:inline-block; padding:12px 24px; background:#ae89ff; color:#000000; font-weight:600; font-size:14px; text-decoration:none; border-radius:8px;">
        View your published path
      </a>
    `;
    await getResend().emails.send({
      from: getFromAddress(),
      to: opts.to,
      subject: 'Your path is live in the community library',
      html: shell({
        preheader: `"${opts.title}" passed review and is now public.`,
        bodyHtml: body,
      }),
    });
  } catch (err) {
    console.error('[moderation-email] sendPathApprovedEmail failed', err);
  }
}

/**
 * Rejection email — fires on L2 reject and L5 admin reject.
 *
 * `reasonCode` is the canonical taxonomy code ("l2.spam" / "l5.adult"
 * / "wordlist.en.adult"). We render `describeModerationReason()` so
 * the author sees the plain-English form, never the raw code.
 */
export async function sendPathRejectedEmail(opts: {
  to: string;
  title: string;
  shareId: string;
  reasonCode: string | null;
}): Promise<void> {
  try {
    const titleEsc = htmlEscape(opts.title);
    const reasonPhrase = htmlEscape(describeModerationReason(opts.reasonCode));
    const statusUrl = `${getAppOrigin()}/learn/paths/${encodeURIComponent(opts.shareId)}/publication`;
    const body = `
      <h1 style="font-size:22px; font-weight:700; line-height:1.3; margin:0 0 16px; color:#ae89ff; letter-spacing:-0.01em;">
        We couldn't publish your path.
      </h1>
      <p style="font-size:16px; line-height:1.6; margin:0 0 12px; color:#eeecff;">
        <strong style="color:#eeecff;">${titleEsc}</strong> was rejected during automatic review.
      </p>
      <p style="font-size:14px; line-height:1.6; margin:0 0 24px; color:#c0bed8;">
        Reason: ${reasonPhrase}.
      </p>
      <p style="font-size:14px; line-height:1.6; margin:0 0 28px; color:#c0bed8;">
        If you think this was a mistake, you can edit the path and try again, or open the publication status page for the full audit trail.
      </p>
      <a href="${statusUrl}" style="display:inline-block; padding:12px 24px; background:#ae89ff; color:#000000; font-weight:600; font-size:14px; text-decoration:none; border-radius:8px;">
        Open publication status
      </a>
    `;
    await getResend().emails.send({
      from: getFromAddress(),
      to: opts.to,
      subject: 'Your path was rejected during review',
      html: shell({
        preheader: `"${opts.title}" was rejected — ${describeModerationReason(opts.reasonCode)}.`,
        bodyHtml: body,
      }),
    });
  } catch (err) {
    console.error('[moderation-email] sendPathRejectedEmail failed', err);
  }
}

/**
 * Flagged-for-human-review email — fires when L2 returns `flag` and the
 * path moves into L3 / human queue. Per AC-Moderate-8 the author gets a
 * heads-up so the path-card chip doesn't sit silently in "auditing" for
 * an indeterminate stretch.
 */
export async function sendPathFlaggedEmail(opts: {
  to: string;
  title: string;
  shareId: string;
}): Promise<void> {
  try {
    const titleEsc = htmlEscape(opts.title);
    const statusUrl = `${getAppOrigin()}/learn/paths/${encodeURIComponent(opts.shareId)}/publication`;
    const body = `
      <h1 style="font-size:22px; font-weight:700; line-height:1.3; margin:0 0 16px; color:#ae89ff; letter-spacing:-0.01em;">
        Your path is in human review.
      </h1>
      <p style="font-size:16px; line-height:1.6; margin:0 0 12px; color:#eeecff;">
        <strong style="color:#eeecff;">${titleEsc}</strong> was flagged by automatic review and is queued for a human moderator.
      </p>
      <p style="font-size:14px; line-height:1.6; margin:0 0 28px; color:#c0bed8;">
        No action needed on your side. We'll send another email once the review is complete.
      </p>
      <a href="${statusUrl}" style="display:inline-block; padding:12px 24px; background:#ae89ff; color:#000000; font-weight:600; font-size:14px; text-decoration:none; border-radius:8px;">
        See review status
      </a>
    `;
    await getResend().emails.send({
      from: getFromAddress(),
      to: opts.to,
      subject: 'Your path is queued for human review',
      html: shell({
        preheader: `"${opts.title}" is queued for human review.`,
        bodyHtml: body,
      }),
    });
  } catch (err) {
    console.error('[moderation-email] sendPathFlaggedEmail failed', err);
  }
}
