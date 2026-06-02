// email-templates.ts — branded HTML + plain-text builders for all transactional emails.
//
// Each builder returns { subject, text, html }.
// html uses inline CSS only (safe for email clients). Brand: indigo #4F46E5.
// text is a plain-text fallback (no HTML).
// SMS stays plain text — use the helpers in otp.service.ts directly.

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

// ─── Shared layout wrapper ────────────────────────────────────────────────────

function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#4F46E5;padding:24px 32px;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Shiftify</span>
              <span style="color:#C7D2FE;font-size:13px;margin-left:8px;">NDIS Marketplace</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;">
              <p style="margin:0;font-size:12px;color:#9CA3AF;line-height:1.6;">
                You received this email because you have an account on Shiftify.<br/>
                If you did not request this, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function codeBox(code: string): string {
  return `<div style="margin:24px 0;text-align:center;">
    <span style="display:inline-block;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:6px;
      padding:12px 32px;font-size:32px;font-weight:700;letter-spacing:8px;color:#4F46E5;">
      ${code}
    </span>
  </div>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${text}</p>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#111827;">${text}</h1>`;
}

const sig = paragraph("— The Shiftify Team");

// ─── verifyEmail ─────────────────────────────────────────────────────────────

export function verifyEmail(code: string, ttlMinutes = 10): EmailTemplate {
  const subject = "Your Shiftify verification code";

  const text = [
    "Hi,",
    "",
    "Your Shiftify verification code is:",
    "",
    `  ${code}`,
    "",
    `This code expires in ${ttlMinutes} minutes.`,
    "If you did not request this, you can safely ignore this email.",
    "",
    "— The Shiftify Team",
  ].join("\n");

  const html = layout(
    subject,
    heading("Verify your account") +
      paragraph("Use the code below to verify your account on Shiftify.") +
      codeBox(code) +
      paragraph(`This code expires in <strong>${ttlMinutes} minutes</strong>. Do not share it with anyone.`) +
      sig,
  );

  return { subject, text, html };
}

// ─── passwordReset ────────────────────────────────────────────────────────────

export function passwordReset(code: string, ttlMinutes = 10): EmailTemplate {
  const subject = "Reset your Shiftify password";

  const text = [
    "Hi,",
    "",
    "We received a request to reset your Shiftify password.",
    "Use the code below on the reset screen:",
    "",
    `  ${code}`,
    "",
    `This code expires in ${ttlMinutes} minutes.`,
    "If you did not request a password reset, please ignore this email — your password has not been changed.",
    "",
    "— The Shiftify Team",
  ].join("\n");

  const html = layout(
    subject,
    heading("Reset your password") +
      paragraph("We received a request to reset your Shiftify password. Enter the code below on the reset screen.") +
      codeBox(code) +
      paragraph(`This code expires in <strong>${ttlMinutes} minutes</strong>.`) +
      paragraph("If you did not request a password reset, you can safely ignore this email — your password has not been changed.") +
      sig,
  );

  return { subject, text, html };
}

// ─── welcomeEmail ─────────────────────────────────────────────────────────────

export function welcomeEmail(name: string): EmailTemplate {
  const subject = "Welcome to Shiftify";

  const text = [
    `Hi ${name},`,
    "",
    "Welcome to Shiftify — Australia's NDIS marketplace.",
    "",
    "Complete your profile to get started. Once your account is activated, you'll have full access to the platform.",
    "",
    "— The Shiftify Team",
  ].join("\n");

  const html = layout(
    subject,
    heading(`Welcome, ${name}!`) +
      paragraph("You've successfully created your Shiftify account. We're thrilled to have you on Australia's leading NDIS marketplace.") +
      paragraph("To get started, complete your profile and activate your account — it only takes a few minutes.") +
      `<div style="margin:24px 0;">
        <a href="#" style="display:inline-block;background:#4F46E5;color:#ffffff;padding:12px 28px;border-radius:6px;
          font-size:15px;font-weight:600;text-decoration:none;">Complete your profile</a>
      </div>` +
      sig,
  );

  return { subject, text, html };
}
