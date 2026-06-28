import {
  formatScheduleEmailCompactDate,
  formatScheduleEmailTime
} from "../lib/formatScheduleEmail";

export interface SchedulePublicationResourceLink {
  label: string;
  downloadUrl?: string;
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
  /** Extra lines shown under the event header (updates only). */
  statusLines?: string[];
}

export function formatScheduleEventText(event: SchedulePublicationEventBlock): string {
  const dateLabel = formatScheduleEmailCompactDate(event.occurrenceDate);
  const timeLabel = formatScheduleEmailTime(event.startTime);
  const lines = [`${dateLabel} — ${event.occurrenceName} — ${timeLabel}`, ""];

  for (const line of event.statusLines ?? []) {
    lines.push(line);
    lines.push("");
  }

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
      if (resource.downloadUrl) {
        lines.push(`- ${resource.label}: ${resource.downloadUrl}`);
      } else {
        lines.push(`- ${resource.label}`);
      }
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
        if (resource.downloadUrl) {
          lines.push(`- ${resource.label}: ${resource.downloadUrl}`);
        } else {
          lines.push(`- ${resource.label}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

export function formatScheduleEventHtml(event: SchedulePublicationEventBlock): string {
  const dateLabel = escapeHtml(formatScheduleEmailCompactDate(event.occurrenceDate));
  const timeLabel = escapeHtml(formatScheduleEmailTime(event.startTime));
  const eventName = escapeHtml(event.occurrenceName);

  let html = `<p><strong>${dateLabel} — ${eventName} — ${timeLabel}</strong></p>`;

  for (const line of event.statusLines ?? []) {
    html += `<p>${escapeHtml(line)}</p>`;
  }

  if (event.generalNotes.length > 0) {
    html += `<p>General notes:</p><ul>${event.generalNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
  }

  if (event.generalResources.length > 0) {
    html += `<p>General resources:</p><ul>${event.generalResources
      .map((resource) =>
        resource.downloadUrl
          ? resourceListItemHtml(resource)
          : `<li>${escapeHtml(resource.label)}</li>`
      )
      .join("")}</ul>`;
  }

  for (const area of event.servingAreas) {
    const areaName = escapeHtml(area.servingAreaName);
    html += `<p>Serving area: <strong>${areaName}</strong></p>`;

    if (area.notes.length > 0) {
      html += `<p>${areaName} notes:</p><ul>${area.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
    }

    if (area.resources.length > 0) {
      html += `<p>${areaName} resources:</p><ul>${area.resources
        .map((resource) =>
          resource.downloadUrl
            ? resourceListItemHtml(resource)
            : `<li>${escapeHtml(resource.label)}</li>`
        )
        .join("")}</ul>`;
    }
  }

  return html;
}

export function resourceListItemHtml(resource: SchedulePublicationResourceLink): string {
  const label = escapeHtml(resource.label);
  if (!resource.downloadUrl) {
    return `<li>${label}</li>`;
  }
  const url = escapeHtml(resource.downloadUrl);
  return `<li><a href="${url}">${label}</a></li>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
