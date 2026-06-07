import type { Env } from "../types";

export interface ChurchSlugHintOrg {
  name: string;
  slug: string;
  signInUrl: string;
}

export interface ChurchSlugHintEmailInput {
  to: string;
  displayName: string;
  organizations: ChurchSlugHintOrg[];
}

export async function sendChurchSlugHintEmail(
  env: Env,
  input: ChurchSlugHintEmailInput
): Promise<void> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = "Your ServeWell church sign-in details";
  const html = buildChurchSlugHintHtml(input.displayName, input.organizations);
  const text = buildChurchSlugHintText(input.displayName, input.organizations);

  if (!apiKey) {
    console.info(
      "[ServeWell] Church slug hint email not sent (RESEND_API_KEY missing). Organizations:",
      input.organizations.map((o) => `${o.name} (${o.slug})`).join(", ")
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
    throw new Error("Unable to send church sign-in reminder email.");
  }
}

function resolveFromAddress(env: Env): string {
  const configured = env.RESEND_FROM?.trim();
  if (configured) {
    return configured;
  }

  return "ServeWell <onboarding@resend.dev>";
}

function buildChurchSlugHintHtml(displayName: string, organizations: ChurchSlugHintOrg[]): string {
  const greeting = displayName ? `Hi ${escapeHtml(displayName)},` : "Hi,";
  const items = organizations
    .map(
      (org) =>
        `<li><strong>${escapeHtml(org.name)}</strong> — church URL slug: <code>${escapeHtml(org.slug)}</code><br />Sign in at <a href="${escapeHtml(org.signInUrl)}">${escapeHtml(org.signInUrl)}</a></li>`
    )
    .join("");

  const intro =
    organizations.length === 1
      ? "<p>Here is the church you can sign in to with this email:</p>"
      : "<p>Here are the churches you can sign in to with this email:</p>";

  return `
    <p>${greeting}</p>
    <p>Someone requested a reminder of ServeWell staff sign-in details for this email address.</p>
    ${intro}
    <ul>${items}</ul>
    <p>On the sign-in page, enter the <strong>church URL slug</strong> exactly as shown (the part used in your dashboard link, e.g. <code>/your-slug/admin</code>).</p>
    <p>If you did not request this, you can ignore this email.</p>
    <p style="color:#6b7280;font-size:12px;">ServeWell — volunteer intake for your church</p>
  `.trim();
}

function buildChurchSlugHintText(displayName: string, organizations: ChurchSlugHintOrg[]): string {
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  const lines = organizations.map(
    (org) =>
      `- ${org.name} — church URL slug: ${org.slug}\n  Sign in: ${org.signInUrl}`
  );

  return `${greeting}

Someone requested a reminder of ServeWell staff sign-in details for this email address.

${organizations.length === 1 ? "Church:" : "Churches:"}
${lines.join("\n")}

On the sign-in page, enter the church URL slug exactly as shown (the part used in your dashboard link, e.g. /your-slug/admin).

If you did not request this, you can ignore this email.

— ServeWell`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
