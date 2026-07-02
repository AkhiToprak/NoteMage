import { Resend } from 'resend';

// Weakness Training Phase 4.4a (plan `plans/weakness-training-phase4.md`
// §14.4) — the weekly weak-spot nudge digest email. Structurally cloned from
// `exam-reminder-email.ts` (same Resend client idiom, same dark-card
// no-gradient template, same never-throws contract) — imports its
// `getFromAddress`/`getAppUrl` helpers rather than duplicating them.

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getFromAddress() {
  // Coolify env values can arrive with a trailing newline / stray whitespace,
  // which Resend rejects with a 422 — strip a literal "\n" and trim. Mirrors
  // exam-reminder-email.ts's getFromAddress() exactly.
  const raw = process.env.RESEND_FROM_EMAIL || 'NoteMage <noreply@notemage.app>';
  return raw.replace(/\\n/g, '').trim();
}

function getAppUrl() {
  return (process.env.NEXTAUTH_URL || 'https://notemage.app').replace(/\/$/, '');
}

// Brand palette — solid colors only (the project bans gradients). Identical
// values to exam-reminder-email.ts's `C` so all NoteMage mail looks unified.
const C = {
  pageBg: '#0c0c18',
  cardBg: '#15152b',
  cardBorder: '#2a2a4c',
  accent: '#ae89ff',
  heading: '#ffffff',
  body: '#c0bed8',
  muted: '#8888a8',
  footer: '#6a6a86',
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Digest trigger kinds, ordered highest → lowest subject priority (plan
 *  §16 Q13 default: failure streak > rusty > ignored > graduation). */
export type WeaknessNudgeTriggerKind =
  | 'retest_failing'
  | 'rusty'
  | 'ignored_weak'
  | 'graduation_available';

const TRIGGER_PRIORITY: WeaknessNudgeTriggerKind[] = [
  'retest_failing',
  'rusty',
  'ignored_weak',
  'graduation_available',
];

export interface WeaknessNudgeConceptLine {
  conceptId: string;
  /** Verbatim `whyFlagged`-style string — never re-authored, never a
   *  psychological claim about the learner (plan §14.4 / base plan §2.3). */
  whyFlagged: string;
}

export interface WeaknessNudgeEmailParams {
  /** Trigger kinds that fired this digest — used only to pick subject
   *  priority, never rendered verbatim. */
  triggerKinds: WeaknessNudgeTriggerKind[];
  /** Up to 5 concept lines, already capped by the caller. */
  concepts: WeaknessNudgeConceptLine[];
}

/** Highest-priority trigger present in `triggerKinds`, or null if empty. */
function leadTrigger(triggerKinds: WeaknessNudgeTriggerKind[]): WeaknessNudgeTriggerKind | null {
  for (const kind of TRIGGER_PRIORITY) {
    if (triggerKinds.includes(kind)) return kind;
  }
  return null;
}

/** Terse subject line keyed off the highest-priority trigger + concept
 *  count. Graduation gets its own singular-friendly copy per plan §14.4's
 *  example ("1 concept ready to graduate"). */
export function buildWeaknessNudgeSubject(params: WeaknessNudgeEmailParams): string {
  const count = params.concepts.length;
  const lead = leadTrigger(params.triggerKinds);

  if (lead === 'graduation_available') {
    return count === 1
      ? '1 concept ready to graduate'
      : `${count} concepts ready to graduate`;
  }

  return count === 1 ? '1 weak spot waiting' : `${count} weak spots waiting`;
}

export function renderWeaknessNudgeEmail(params: WeaknessNudgeEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const appUrl = getAppUrl();
  const subject = buildWeaknessNudgeSubject(params);
  const url = `${appUrl}/profile/weak-spots`;
  const lead = 'A quick check-in on where you stand.';

  const bulletItems = params.concepts
    .map(
      (c) => `
                <tr>
                  <td style="padding:0 0 12px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="16" style="padding-top:2px;">
                          <span style="display:inline-block; width:6px; height:6px; border-radius:999px; background-color:${C.accent};">&nbsp;</span>
                        </td>
                        <td style="font-family:${FONT_STACK}; font-size:14px; line-height:1.55; color:${C.body};">
                          ${c.whyFlagged}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${subject}</title>
</head>
<body style="margin:0; padding:0; background-color:${C.pageBg};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
    ${lead}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.pageBg}" style="background-color:${C.pageBg};">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; background-color:${C.cardBg}; border:1px solid ${C.cardBorder}; border-radius:24px; overflow:hidden;">
          <tr>
            <td style="height:4px; line-height:4px; font-size:4px; background-color:${C.accent};">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:36px 40px 40px;">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <img src="${appUrl}/mascot/holding-wand-v2.png" width="104" height="104" alt="NoteMage mascot" style="display:block; width:104px; height:auto; border:0; outline:none; text-decoration:none;">
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:10px;">
                    <span style="font-family:${FONT_STACK}; font-size:20px; font-weight:800; letter-spacing:-0.02em; color:${C.accent};">NoteMage</span>
                  </td>
                </tr>
              </table>

              <h1 style="margin:26px 0 10px; text-align:center; font-family:${FONT_STACK}; font-size:23px; font-weight:800; letter-spacing:-0.02em; color:${C.heading};">
                ${subject}
              </h1>
              <p style="margin:0 0 22px; text-align:center; font-family:${FONT_STACK}; font-size:15px; line-height:1.6; color:${C.body};">
                ${lead}
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px;">
                ${bulletItems}
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${url}" style="display:inline-block; background-color:${C.accent}; color:#12081f; font-family:${FONT_STACK}; font-size:15px; font-weight:700; text-decoration:none; padding:13px 28px; border-radius:12px;">
                      Review weak spots
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:28px 0 0;">
                    <div style="border-top:1px solid ${C.cardBorder}; line-height:1px; font-size:1px;">&nbsp;</div>
                  </td>
                </tr>
              </table>

              <p style="margin:22px 0 0; text-align:center; font-family:${FONT_STACK}; font-size:12.5px; line-height:1.6; color:${C.muted};">
                You're getting this because weak-spot nudges are on. Manage them in
                <a href="${appUrl}/settings/notifications" style="color:${C.accent}; text-decoration:none;">notification settings</a>.
              </p>

            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding:24px 16px 0; font-family:${FONT_STACK}; font-size:12px; line-height:1.6; color:${C.footer};">
              © NoteMage · Basel, Switzerland
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    '',
    lead,
    '',
    ...params.concepts.map((c) => `- ${c.whyFlagged}`),
    '',
    `Review weak spots: ${url}`,
    '',
    `Manage reminders: ${appUrl}/settings/notifications`,
    '',
    '— The NoteMage Team',
  ].join('\n');

  return { subject, html, text };
}

/**
 * Send a weak-spot nudge digest email. Returns true on success. Never
 * throws — the sweep treats a failed send as non-fatal (the in-app
 * `WeaknessNudgeLog` row is still written; email is a best-effort second
 * channel, mirroring `sendExamReminderEmail`).
 */
export async function sendWeaknessNudgeEmail(
  to: string,
  params: WeaknessNudgeEmailParams,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const { subject, html, text } = renderWeaknessNudgeEmail(params);
    await getResend().emails.send({ from: getFromAddress(), to, subject, html, text });
    return true;
  } catch (err) {
    console.error('Failed to send weakness-nudge email:', err);
    return false;
  }
}
