import type { Env } from "../types";

export interface AdminJoinedNotificationEmailInput {
  to: string;
  recipientDisplayName: string;
  organizationName: string;
  joinedAdminDisplayName: string;
  joinedAdminEmail: string;
  profileUrl: string;
}

export async function sendAdminJoinedNotificationEmail(
  env: Env,
  input: AdminJoinedNotificationEmailInput
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = `New admin joined — ${input.organizationName}`;
  const html = buildHtml(input);
  const text = buildText(input);

  if (!apiKey) {
    console.info(
      `[ServeWell] Admin joined notification not sent (RESEND_API_KEY missing). → ${input.to}:`,
      input.profileUrl
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
    console.error("Resend admin joined notification failed", response.status, body);
    throw new Error("Unable to send admin joined notification email.");
  }
}

function buildHtml(input: AdminJoinedNotificationEmailInput): string {
  const greeting = input.recipientDisplayName
    ? `Hi ${escapeHtml(input.recipientDisplayName)},`
    : "Hi,";

  return `
    <p>${greeting}</p>
    <p><strong>${escapeHtml(input.organizationName)}</strong></p>
    <p>An invited admin accepted their invitation and can sign in to ServeWell.</p>
    <p>
      <strong>${escapeHtml(input.joinedAdminDisplayName)}</strong>
      (${escapeHtml(input.joinedAdminEmail)})
    </p>
    <p><a href="${escapeHtml(input.profileUrl)}">View team on profile</a></p>
    <p style="color:#6b7280;font-size:12px;">ServeWell — volunteer intake for your church</p>
  `.trim();
}

function buildText(input: AdminJoinedNotificationEmailInput): string {
  const greeting = input.recipientDisplayName ? `Hi ${input.recipientDisplayName},` : "Hi,";

  return `${greeting}

${input.organizationName}

An invited admin accepted their invitation and can sign in to ServeWell.

${input.joinedAdminDisplayName} (${input.joinedAdminEmail})

View team on profile: ${input.profileUrl}

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
