import {
  formatScheduleEmailCompactDate,
  formatScheduleEmailTime
} from "../lib/formatScheduleEmail";
import type { Env } from "../types";

export interface SchedulePublicationResourceLink {
  label: string;
  downloadUrl: string;
}

export interface SchedulePublicationServingAreaBlock {
  servingAreaName: string;
  notes: string[];
  resources: SchedulePublicationResourceLink[];
}

export interface SchedulePublicationEventBlock {
  occurrenceDate: string;
  occurrenceName: string;
  startTime: string;
  generalNotes: string[];
  generalResources: SchedulePublicationResourceLink[];
  servingAreas: SchedulePublicationServingAreaBlock[];
}

export interface SchedulePublicationEmailInput {
  to: string;
  firstName: string;
  scheduleName: string;
  events: SchedulePublicationEventBlock[];
}

export async function sendSchedulePublicationEmail(
  env: Env,
  input: SchedulePublicationEmailInput
): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY?.trim();
  const subject = `Your schedule: ${input.scheduleName}`;
  const html = buildHtml(input);
  const text = buildText(input);

  if (!apiKey) {
    console.info(
      `[ServeWell] Schedule publication email not sent (RESEND_API_KEY missing). → ${input.to}:`,
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
    console.error("Resend schedule publication email failed", response.status, body);
    return false;
  }

  return true;
}

function buildText(input: SchedulePublicationEmailInput): string {
  const greetingName = input.firstName.trim() || "there";
  const eventSections = input.events.map((event) => formatEventText(event)).join("\n\n");

  return `Hi ${greetingName},

You have been scheduled for ${input.scheduleName}.

${eventSections}

Thank you for serving.

— ServeWell`;
}

function formatEventText(event: SchedulePublicationEventBlock): string {
  const dateLabel = formatScheduleEmailCompactDate(event.occurrenceDate);
  const timeLabel = formatScheduleEmailTime(event.startTime);
  const lines = [`${dateLabel} — ${event.occurrenceName} — ${timeLabel}`, ""];

  if (event.generalNotes.length > 0) {
    lines.push("General notes:");
    for (const note of event.generalNotes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  if (event.generalResources.length > 0) {
    lines.push("General resources:");
    for (const resource of event.generalResources) {
      lines.push(`- ${resource.label}: ${resource.downloadUrl}`);
    }
    lines.push("");
  }

  for (const area of event.servingAreas) {
    lines.push(`Serving area: ${area.servingAreaName}`, "");

    if (area.notes.length > 0) {
      lines.push(`${area.servingAreaName} notes:`);
      for (const note of area.notes) {
        lines.push(`- ${note}`);
      }
      lines.push("");
    }

    if (area.resources.length > 0) {
      lines.push(`${area.servingAreaName} resources:`);
      for (const resource of area.resources) {
        lines.push(`- ${resource.label}: ${resource.downloadUrl}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

function buildHtml(input: SchedulePublicationEmailInput): string {
  const greetingName = escapeHtml(input.firstName.trim() || "there");
  const scheduleName = escapeHtml(input.scheduleName);
  const eventHtml = input.events.map((event) => formatEventHtml(event)).join("<hr style=\"border:none;border-top:1px solid #e5e7eb;margin:1.25rem 0;\" />");

  return `
    <p>Hi ${greetingName},</p>
    <p>You have been scheduled for <strong>${scheduleName}</strong>.</p>
    ${eventHtml}
    <p>Thank you for serving.</p>
    <p style="color:#6b7280;font-size:12px;">ServeWell</p>
  `.trim();
}

function formatEventHtml(event: SchedulePublicationEventBlock): string {
  const dateLabel = escapeHtml(formatScheduleEmailCompactDate(event.occurrenceDate));
  const timeLabel = escapeHtml(formatScheduleEmailTime(event.startTime));
  const eventName = escapeHtml(event.occurrenceName);

  let html = `<p><strong>${dateLabel} — ${eventName} — ${timeLabel}</strong></p>`;

  if (event.generalNotes.length > 0) {
    html += `<p>General notes:</p><ul>${event.generalNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
  }

  if (event.generalResources.length > 0) {
    html += `<p>General resources:</p><ul>${event.generalResources.map((resource) => resourceListItemHtml(resource)).join("")}</ul>`;
  }

  for (const area of event.servingAreas) {
    const areaName = escapeHtml(area.servingAreaName);
    html += `<p>Serving area: <strong>${areaName}</strong></p>`;

    if (area.notes.length > 0) {
      html += `<p>${areaName} notes:</p><ul>${area.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
    }

    if (area.resources.length > 0) {
      html += `<p>${areaName} resources:</p><ul>${area.resources.map((resource) => resourceListItemHtml(resource)).join("")}</ul>`;
    }
  }

  return html;
}

function resourceListItemHtml(resource: SchedulePublicationResourceLink): string {
  const label = escapeHtml(resource.label);
  const url = escapeHtml(resource.downloadUrl);
  return `<li><a href="${url}">${label}</a></li>`;
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
