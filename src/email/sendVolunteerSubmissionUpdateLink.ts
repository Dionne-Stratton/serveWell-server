import type { Env } from "../types";

export interface VolunteerSubmissionUpdateLinkEmailInput {
  to: string;
  organizationName: string;
  updateUrl: string;
}

export async function sendVolunteerSubmissionUpdateLinkEmail(
  env: Env,
  input: VolunteerSubmissionUpdateLinkEmailInput
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = `Update your volunteer submission — ${input.organizationName}`;
  const html = buildHtml(input);
  const text = buildText(input);

  if (!apiKey) {
    console.info(
      `[ServeWell] Volunteer update link not sent (RESEND_API_KEY missing). → ${input.to}:`,
      input.updateUrl
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
    console.error("Resend volunteer update link failed", response.status, body);
    throw new Error("Unable to send volunteer update link email.");
  }
}

function buildHtml(input: VolunteerSubmissionUpdateLinkEmailInput): string {
  return `
    <p>You requested a link to update your volunteer interest form for <strong>${escapeHtml(input.organizationName)}</strong>.</p>
    <p><a href="${escapeHtml(input.updateUrl)}">Open your submission to edit</a></p>
    <p>This link expires in 7 days. After you save changes, you will need to request a new link to edit again.</p>
    <p style="color:#6b7280;font-size:12px;">If you did not request this, you can ignore this email.</p>
  `.trim();
}

function buildText(input: VolunteerSubmissionUpdateLinkEmailInput): string {
  return `You requested a link to update your volunteer interest form for ${input.organizationName}.

Open your submission to edit: ${input.updateUrl}

This link expires in 7 days. After you save changes, you will need to request a new link to edit again.

If you did not request this, you can ignore this email.`;
}

function resolveFromAddress(env: Env): string {
  const configured = env.RESEND_FROM?.trim();
  if (configured) {
    return configured;
  }

  return "ServeWell <onboarding@resend.dev>";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
