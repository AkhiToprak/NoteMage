import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || 'Notemage <noreply@notemage.app>';
}

export async function sendWaitlistConfirmation(email: string) {
  try {
    await getResend().emails.send({
      from: getFromAddress(),
      to: email,
      subject: 'Welcome to the Notemage Waitlist!',
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #eeecff; background: #1a1a36;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px; color: #ae89ff;">
            You're on the list!
          </h1>
          <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #c0bed8;">
            Thanks for signing up for the Notemage waitlist. We'll send you an email as soon as we launch.
          </p>
          <p style="font-size: 14px; line-height: 1.6; margin: 0; color: #8888a8;">
            — The Notemage Team
          </p>
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
          html: `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #eeecff; background: #1a1a36;">
              <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px; color: #ae89ff;">
                Notemage is live!
              </h1>
              <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px; color: #c0bed8;">
                The wait is over — Notemage is now available. Head over and create your account to get started.
              </p>
              <a href="https://notemage.app" style="display: inline-block; padding: 12px 28px; background: #ae89ff; color: #1a1a36; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Get Started
              </a>
              <p style="font-size: 14px; line-height: 1.6; margin: 24px 0 0; color: #8888a8;">
                — The Notemage Team
              </p>
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
