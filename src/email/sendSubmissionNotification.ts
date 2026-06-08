import type { Env } from "../types";

export type SubmissionNotificationEvent =
  | "new_submission"
  | "ready_to_schedule"
  | "volunteer_updated";

export interface SubmissionNotificationEmailInput {
  to: string;
  recipientDisplayName: string;
  organizationName: string;
  volunteerName: string;
  event: SubmissionNotificationEvent;
  statusLabel: string;
  detailUrl: string;
}

export async function sendSubmissionNotificationEmail(
  env: Env,
  input: SubmissionNotificationEmailInput
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = buildSubject(input);
  const html = buildHtml(input);
  const text = buildText(input);

  if (!apiKey) {
    console.info(
      `[ServeWell] Submission notification not sent (RESEND_API_KEY missing). ${input.event} → ${input.to}:`,
      input.detailUrl
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
    console.error("Resend submission notification failed", response.status, body);
    throw new Error("Unable to send submission notification email.");
  }
}

function buildSubject(input: SubmissionNotificationEmailInput): string {
  if (input.event === "new_submission") {
    return `New volunteer submission — ${input.organizationName}`;
  }

  if (input.event === "volunteer_updated") {
    return `Volunteer updated submission — ${input.volunteerName} (${input.organizationName})`;
  }

  return `Ready to schedule — ${input.volunteerName} (${input.organizationName})`;
}

function buildEventLine(input: SubmissionNotificationEmailInput): string {
  if (input.event === "new_submission") {
    return `A new volunteer submitted your public form. Status: ${input.statusLabel}.`;
  }

  if (input.event === "volunteer_updated") {
    return "A volunteer updated their submission using a secure link. Please review the changes.";
  }

  return `${input.volunteerName} was marked ${input.statusLabel}.`;
}

function buildHtml(input: SubmissionNotificationEmailInput): string {
  const greeting = input.recipientDisplayName
    ? `Hi ${escapeHtml(input.recipientDisplayName)},`
    : "Hi,";

  return `
    <p>${greeting}</p>
    <p><strong>${escapeHtml(input.organizationName)}</strong></p>
    <p>${escapeHtml(buildEventLine(input))}</p>
    <p>Volunteer: <strong>${escapeHtml(input.volunteerName)}</strong></p>
    <p><a href="${escapeHtml(input.detailUrl)}">View submission</a></p>
    <p style="color:#6b7280;font-size:12px;">ServeWell — volunteer intake for your church</p>
  `.trim();
}

function buildText(input: SubmissionNotificationEmailInput): string {
  const greeting = input.recipientDisplayName ? `Hi ${input.recipientDisplayName},` : "Hi,";

  return `${greeting}

${input.organizationName}

${buildEventLine(input)}

Volunteer: ${input.volunteerName}

View submission: ${input.detailUrl}

— ServeWell`;
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
