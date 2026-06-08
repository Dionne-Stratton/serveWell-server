import type { Env } from "../types";

export interface FounderOrganizationSignupEmailInput {
  to: string;
  organizationName: string;
  organizationSlug: string;
  ownerDisplayName: string;
  ownerEmail: string;
  signedUpAt: string;
}

export async function sendFounderOrganizationSignupEmail(
  env: Env,
  input: FounderOrganizationSignupEmailInput
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = `New organization signup — ${input.organizationName}`;
  const html = buildHtml(input);
  const text = buildText(input);

  if (!apiKey) {
    console.info(
      `[ServeWell] Founder signup notification not sent (RESEND_API_KEY missing). Org: ${input.organizationSlug}`
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
    console.error("Resend founder signup notification failed", response.status, body);
    throw new Error("Unable to send founder signup notification email.");
  }
}

function buildHtml(input: FounderOrganizationSignupEmailInput): string {
  return `
    <p>A new organization signed up for ServeWell.</p>
    <ul>
      <li><strong>Organization:</strong> ${escapeHtml(input.organizationName)}</li>
      <li><strong>URL slug:</strong> ${escapeHtml(input.organizationSlug)}</li>
      <li><strong>Owner name:</strong> ${escapeHtml(input.ownerDisplayName)}</li>
      <li><strong>Owner email:</strong> ${escapeHtml(input.ownerEmail)}</li>
      <li><strong>Signed up at:</strong> ${escapeHtml(input.signedUpAt)}</li>
    </ul>
    <p style="color:#6b7280;font-size:12px;">ServeWell — internal founder notification</p>
  `.trim();
}

function buildText(input: FounderOrganizationSignupEmailInput): string {
  return `A new organization signed up for ServeWell.

Organization: ${input.organizationName}
URL slug: ${input.organizationSlug}
Owner name: ${input.ownerDisplayName}
Owner email: ${input.ownerEmail}
Signed up at: ${input.signedUpAt}

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
