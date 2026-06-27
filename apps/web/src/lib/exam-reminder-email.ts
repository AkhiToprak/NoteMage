import { Resend } from 'resend';

// Exam Mode (Phase 6) — transactional exam-reminder email. Mirrors the Resend
// client + dark table-based template from `verification-email.ts` (same sender
// identity, same no-gradient brand palette) so all NoteMage mail looks unified.

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getFromAddress() {
  // Coolify env values can arrive with a trailing newline / stray whitespace,
  // which Resend rejects with a 422 — strip a literal "\n" and trim.
  const raw = process.env.RESEND_FROM_EMAIL || 'NoteMage <noreply@notemage.app>';
  return raw.replace(/\\n/g, '').trim();
}

function getAppUrl() {
  return (process.env.NEXTAUTH_URL || 'https://notemage.app').replace(/\/$/, '');
}

// Brand palette — solid colors only (the project bans gradients).
const C = {
  pageBg: '#0c0c18',
  cardBg: '#15152b',
  cardBorder: '#2a2a4c',
  accent: '#ae89ff', // brand purple
  gold: '#ffde59', // brand gold
  heading: '#ffffff',
  body: '#c0bed8',
  muted: '#8888a8',
  footer: '#6a6a86',
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type ExamReminderKind = 'countdown' | 'readiness';

export interface ExamReminderEmailParams {
  examTitle: string;
  kind: ExamReminderKind;
  /** Whole days until the exam (0 = today, 1 = tomorrow). */
  daysLeft: number;
  /** Absolute URL to the exam hub. */
  examUrl: string;
  /** Readiness % (0–100), only meaningful for the readiness kind. */
  readiness?: number;
  /** Number of weak topics, only meaningful for the readiness kind. */
  weakCount?: number;
}

/** The headline + supporting line for each reminder kind. */
function reminderCopy(params: ExamReminderEmailParams): {
  subject: string;
  heading: string;
  lead: string;
  cta: string;
} {
  const { examTitle, kind, daysLeft, readiness, weakCount } = params;

  if (kind === 'readiness') {
    const pct = typeof readiness === 'number' ? `${readiness}% ready` : 'still building readiness';
    const weak =
      typeof weakCount === 'number' && weakCount > 0
        ? `${weakCount} weak ${weakCount === 1 ? 'topic' : 'topics'} to shore up`
        : 'a few topics to shore up';
    const whenLabel = daysLeft <= 1 ? (daysLeft <= 0 ? 'today' : 'tomorrow') : `in ${daysLeft} days`;
    return {
      subject: `${examTitle} is ${whenLabel} — you're behind on weak topics`,
      heading: `Let's close the gap on ${examTitle}`,
      lead: `Your exam is ${whenLabel} and you're ${pct}, with ${weak}. A short practice session now moves the needle most.`,
      cta: 'Review weak topics',
    };
  }

  // countdown
  if (daysLeft <= 0) {
    return {
      subject: `${examTitle} is today — you've got this`,
      heading: `${examTitle} is today`,
      lead: `It's exam day. Take a breath, trust your prep, and go show what you know.`,
      cta: 'Open exam',
    };
  }
  if (daysLeft === 1) {
    return {
      subject: `${examTitle} is tomorrow`,
      heading: `${examTitle} is tomorrow`,
      lead: `One day to go. A light review of your weak areas tonight beats cramming — keep it calm.`,
      cta: 'Open exam',
    };
  }
  return {
    subject: `${examTitle} is in ${daysLeft} days`,
    heading: `${examTitle} is in ${daysLeft} days`,
    lead: `Time to lock in. Open your exam to see today's plan, your readiness, and what to practice next.`,
    cta: 'Open exam',
  };
}

export function renderExamReminderEmail(params: ExamReminderEmailParams): {
  subject: string;
  html: string;
  text: string;
} {
  const appUrl = getAppUrl();
  const { subject, heading, lead, cta } = reminderCopy(params);
  const url = params.examUrl;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${heading}</title>
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
                ${heading}
              </h1>
              <p style="margin:0 0 28px; text-align:center; font-family:${FONT_STACK}; font-size:15px; line-height:1.6; color:${C.body};">
                ${lead}
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <a href="${url}" style="display:inline-block; background-color:${C.accent}; color:#12081f; font-family:${FONT_STACK}; font-size:15px; font-weight:700; text-decoration:none; padding:13px 28px; border-radius:12px;">
                      ${cta}
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
                You're getting this because exam reminders are on. Manage them in
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
    heading,
    '',
    lead,
    '',
    `${cta}: ${url}`,
    '',
    `Manage reminders: ${appUrl}/settings/notifications`,
    '',
    '— The NoteMage Team',
  ].join('\n');

  return { subject, html, text };
}

/**
 * Send an exam-reminder email. Returns true on success. Never throws — the
 * cron sweep treats a failed send as non-fatal (the in-app notification is the
 * source of truth; email is a best-effort second channel).
 */
export async function sendExamReminderEmail(
  to: string,
  params: ExamReminderEmailParams,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  const { subject, html, text } = renderExamReminderEmail(params);
  try {
    await getResend().emails.send({ from: getFromAddress(), to, subject, html, text });
    return true;
  } catch (err) {
    console.error('Failed to send exam-reminder email:', err);
    return false;
  }
}
