import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getFromAddress() {
  // Coolify env values can arrive with a trailing newline or stray whitespace,
  // which Resend rejects with a 422 ("Invalid `from` field"). Strip a literal
  // "\n" and trim the ends so a misconfigured env var can't break sends.
  const raw = process.env.RESEND_FROM_EMAIL || 'Notemage <noreply@notemage.app>';
  return raw.replace(/\\n/g, '').trim();
}

// Commercial-email compliance (CAN-SPAM / EU ePrivacy / Swiss UWG): every
// promotional send needs a working opt-out and the sender's physical postal
// address. These emails go to the marketing waitlist, so both belong here.
const UNSUBSCRIBE_MAILTO = 'mailto:notemage.app@gmail.com?subject=Unsubscribe';

// One-click opt-out signal for inbox providers (RFC 2369 / 8058).
const COMPLIANCE_HEADERS = { 'List-Unsubscribe': `<${UNSUBSCRIBE_MAILTO}>` };

function complianceFooter() {
  return `
    <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #2a2a4c; font-size: 12px; line-height: 1.6; color: #6c6c8a;">
      <p style="margin: 0 0 6px;">Notemage · Toprak Demirel · Habsburgerstrasse 38, 4055 Basel, Switzerland</p>
      <p style="margin: 0;">You're receiving this because you joined the Notemage waitlist. <a href="${UNSUBSCRIBE_MAILTO}" style="color: #8888a8; text-decoration: underline;">Unsubscribe</a>.</p>
    </div>
  `;
}

export async function sendWaitlistConfirmation(email: string) {
  try {
    await getResend().emails.send({
      from: getFromAddress(),
      to: email,
      subject: 'Welcome to the Notemage Waitlist!',
      headers: COMPLIANCE_HEADERS,
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #eeecff; background: #000000;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px; color: #ae89ff;">
            You're on the list!
          </h1>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #c0bed8;">
            Thanks for signing up for the Notemage waitlist. We'll send you an email as soon as we launch.
          </p>
          <p style="font-size: 14px; line-height: 1.6; margin: 0; color: #8888a8;">
            — The Notemage Team
          </p>
          ${complianceFooter()}
        </div>
      `,
    });
  } catch (err) {
    console.error('Failed to send waitlist confirmation email:', err);
  }
}

const BATCH_SIZE = 100;

export async function sendLaunchAnnouncement(emails: string[]) {
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);

    try {
      await getResend().batch.send(
        batch.map((to) => ({
          from: getFromAddress(),
          to,
          subject: 'Notemage Has Launched!',
          headers: COMPLIANCE_HEADERS,
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #eeecff; background: #000000;">
              <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px; color: #ae89ff;">
                Notemage is live!
              </h1>
              <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #c0bed8;">
                The wait is over — Notemage is now available. Head over and create your account to get started.
              </p>
              <a href="https://notemage.app" style="display: inline-block; padding: 12px 28px; background: #ae89ff; color: #000000; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Get Started
              </a>
              <p style="font-size: 14px; line-height: 1.6; margin: 24px 0 0; color: #8888a8;">
                — The Notemage Team
              </p>
              ${complianceFooter()}
            </div>
          `,
        }))
      );
    } catch (err) {
      console.error(`Failed to send launch batch ${i / BATCH_SIZE + 1}:`, err);
    }

    // Brief pause between batches to avoid rate limits
    if (i + BATCH_SIZE < emails.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
