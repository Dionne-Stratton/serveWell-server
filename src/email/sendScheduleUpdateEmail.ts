import {
  formatScheduleEventHtml,
  formatScheduleEventText,
  type SchedulePublicationEventBlock
} from "./scheduleEmailEventBodies";
import type { Env } from "../types";

export interface ScheduleUpdateEmailInput {
  to: string;
  firstName: string;
  scheduleName: string;
  events: SchedulePublicationEventBlock[];
}

export async function sendScheduleUpdateEmail(
  env: Env,
  input: ScheduleUpdateEmailInput
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = `Schedule update: ${input.scheduleName}`;
  const html = buildHtml(input);
  const text = buildText(input);

  if (!apiKey) {
    console.info(
      `[ServeWell] Schedule update email not sent (RESEND_API_KEY missing). → ${input.to}:`,
      subject
    );
    return false;
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
    console.error("Resend schedule update email failed", response.status, body);
    return false;
  }

  return true;
}

function buildText(input: ScheduleUpdateEmailInput): string {
  const greetingName = input.firstName.trim() || "there";
  const eventSections = input.events.map((event) => formatScheduleEventText(event)).join("\n\n");

  return `Hi ${greetingName},

${input.scheduleName} has been updated:

${eventSections}

Thank you for serving.

— ServeWell`;
}

function buildHtml(input: ScheduleUpdateEmailInput): string {
  const greetingName = escapeHtml(input.firstName.trim() || "there");
  const scheduleName = escapeHtml(input.scheduleName);
  const eventHtml = input.events
    .map((event) => formatScheduleEventHtml(event))
    .join('<hr style="border:none;border-top:1px solid #e5e7eb;margin:1.25rem 0;" />');

  return `
    <p>Hi ${greetingName},</p>
    <p><strong>${scheduleName}</strong> has been updated:</p>
    ${eventHtml}
    <p>Thank you for serving.</p>
    <p style="color:#6b7280;font-size:12px;">ServeWell</p>
  `.trim();
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
