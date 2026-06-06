import type { Env } from "../types";

export interface AdminInviteEmailInput {
  to: string;
  ownerName: string;
  organizationName: string;
  inviteUrl: string;
}

export async function sendAdminInviteEmail(
  env: Env,
  input: AdminInviteEmailInput
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = `You're invited to ${input.organizationName} on ServeWell`;
  const html = buildInviteHtml(input);
  const text = buildInviteText(input);

  if (!apiKey) {
    console.info(
      "[ServeWell] Admin invite email not sent (RESEND_API_KEY missing). Invite link:",
      input.inviteUrl
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
    const body = await response.text();
    throw new Error(`Resend invite email failed (${response.status}): ${body}`);
  }
}

function resolveFromAddress(env: Env): string {
  const from = env.RESEND_FROM?.trim();
  return from && from.length > 0 ? from : "ServeWell <onboarding@resend.dev>";
}

function buildInviteHtml(input: AdminInviteEmailInput): string {
  const owner = escapeHtml(input.ownerName);
  const org = escapeHtml(input.organizationName);
  const url = escapeHtml(input.inviteUrl);

  return `
    <p>${owner} invited you to join <strong>${org}</strong> as an admin in ServeWell.</p>
    <p><a href="${url}">Accept invitation and set your password</a></p>
    <p>This link expires in 7 days.</p>
  `.trim();
}

function buildInviteText(input: AdminInviteEmailInput): string {
  return `${input.ownerName} invited you to join ${input.organizationName} as an admin in ServeWell.

Accept invitation: ${input.inviteUrl}

This link expires in 7 days.`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
