import type { Env } from "../types";

export interface PasswordResetEmailInput {
  to: string;
  displayName: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail(
  env: Env,
  input: PasswordResetEmailInput
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = "Reset your ServeWell password";
  const html = buildPasswordResetHtml(input.displayName, input.resetUrl);
  const text = buildPasswordResetText(input.displayName, input.resetUrl);

  if (!apiKey) {
    console.info(
      "[ServeWell] Password reset email not sent (RESEND_API_KEY missing). Reset link:",
      input.resetUrl
    );
    return;
  }

  const from = resolveFromAddress(env);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Resend API failed", response.status, body);
    throw new Error("Unable to send password reset email.");
  }
}

function resolveFromAddress(env: Env): string {
  const configured = env.RESEND_FROM?.trim();
  if (configured) {
    return configured;
  }

  return "ServeWell <onboarding@resend.dev>";
}

function buildPasswordResetHtml(displayName: string, resetUrl: string): string {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi,";

  return `
    <p>${greeting}</p>
    <p>We received a request to reset your ServeWell staff password.</p>
    <p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>
    <p>This link expires in one hour. If you did not request this, you can ignore this email.</p>
    <p style="color:#6b7280;font-size:12px;">ServeWell — volunteer intake for your church</p>
  `.trim();
}

function buildPasswordResetText(displayName: string, resetUrl: string): string {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";

  return `${greeting}

We received a request to reset your ServeWell staff password.

Reset your password: ${resetUrl}

This link expires in one hour. If you did not request this, you can ignore this email.

— ServeWell`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
