import { Resend } from 'resend';

// Transactional email for the credentials-signup email-confirmation gate.
// Mirrors the Resend client pattern in `waitlist-email.ts` (same SDK, same
// from-address) so there's a single sender identity across all NoteMage mail.

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || 'NoteMage <noreply@notemage.app>';
}

// Absolute base URL for email images. Email clients can't resolve relative
// paths, so the mascot must be a fully-qualified, publicly-reachable URL.
// Prod sets NEXTAUTH_URL to https://notemage.app; the fallback covers it
// in case the var is unset at send time.
function getAppUrl() {
  return (process.env.NEXTAUTH_URL || 'https://notemage.app').replace(/\/$/, '');
}

// Brand palette — solid colors only (the project bans gradients). Purple is
// the primary, gold is the accent reserved here for the code itself so it's
// the single brightest thing in the message.
const C = {
  pageBg: '#0c0c18',
  cardBg: '#15152b',
  cardBorder: '#2a2a4c',
  accent: '#ae89ff', // brand purple
  gold: '#ffde59', // brand gold — the code
  codeBg: '#211a3a',
  codeBorder: '#3a2f63',
  heading: '#ffffff',
  body: '#c0bed8',
  muted: '#8888a8',
  footer: '#6a6a86',
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Build the verification email. Returns both an HTML body (table-based,
 * inline styles, no gradients — robust across Gmail / Outlook / Apple Mail)
 * and a plain-text fallback (improves inbox placement and covers clients
 * that strip HTML).
 */
export function renderVerificationEmail(code: string): { html: string; text: string } {
  const appUrl = getAppUrl();
  const spaced = code.split('').join(' '); // "1 2 3 4 5 6" for the text version

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Confirm your NoteMage email</title>
</head>
<body style="margin:0; padding:0; background-color:${C.pageBg};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
    Your NoteMage verification code is ${code}. It expires in 15 minutes.
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
                    <img src="${appUrl}/mascot/wave-v2.png" width="104" height="104" alt="NoteMage mascot waving hello" style="display:block; width:104px; height:auto; border:0; outline:none; text-decoration:none;">
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:10px;">
                    <span style="font-family:${FONT_STACK}; font-size:20px; font-weight:800; letter-spacing:-0.02em; color:${C.accent};">NoteMage</span>
                  </td>
                </tr>
              </table>

              <h1 style="margin:26px 0 10px; text-align:center; font-family:${FONT_STACK}; font-size:24px; font-weight:800; letter-spacing:-0.02em; color:${C.heading};">
                Confirm your email
              </h1>
              <p style="margin:0 0 26px; text-align:center; font-family:${FONT_STACK}; font-size:15px; line-height:1.6; color:${C.body};">
                Enter this code to finish creating your account.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background-color:${C.codeBg}; border:1px solid ${C.codeBorder}; border-radius:16px; padding:22px 16px;">
                    <div style="font-family:'Courier New', Courier, monospace; font-size:38px; font-weight:700; letter-spacing:12px; color:${C.gold}; padding-left:12px;">
                      ${code}
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:16px 0 0; text-align:center; font-family:${FONT_STACK}; font-size:13px; color:${C.muted};">
                This code expires in 15 minutes.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:28px 0 0;">
                    <div style="border-top:1px solid ${C.cardBorder}; line-height:1px; font-size:1px;">&nbsp;</div>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0; text-align:center; font-family:${FONT_STACK}; font-size:13px; line-height:1.6; color:${C.muted};">
                Didn't try to sign up? You can safely ignore this email — no account is created without this code.
              </p>

            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
          <tr>
            <td align="center" style="padding:24px 16px 0; font-family:${FONT_STACK}; font-size:12px; line-height:1.6; color:${C.footer};">
              © NoteMage · Basel, Switzerland<br>
              You received this because someone entered this address while signing up for NoteMage.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'Confirm your NoteMage email',
    '',
    'Enter this code to finish creating your account:',
    '',
    `    ${spaced}`,
    '',
    'This code expires in 15 minutes.',
    '',
    "Didn't try to sign up? You can safely ignore this email — no account is created without this code.",
    '',
    '— The NoteMage Team',
  ].join('\n');

  return { html, text };
}

/**
 * Send a 6-digit verification code to `email`. Returns true on success.
 * Never throws — callers (register / resend) treat a failed send as a soft
 * error: the account already exists, so the user can request a new code.
 */
export async function sendVerificationCode(email: string, code: string): Promise<boolean> {
  const { html, text } = renderVerificationEmail(code);
  try {
    await getResend().emails.send({
      from: getFromAddress(),
      to: email,
      subject: `${code} is your NoteMage verification code`,
      html,
      text,
    });
    return true;
  } catch (err) {
    console.error('Failed to send verification email:', err);
    return false;
  }
}
