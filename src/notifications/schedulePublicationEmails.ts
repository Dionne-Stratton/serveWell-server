import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import { loadGeneratedSchedulePublishEmailData } from "../db/generatedSchedulePublishEmailData";
import type { GeneratedSchedulePublishAssignmentRow } from "../db/generatedSchedulePublishEmailData";
import {
  sendSchedulePublicationEmail,
  type SchedulePublicationEventBlock
} from "../email/sendSchedulePublicationEmail";
import type { Env } from "../types";
import {
  buildResourceDownloadLinks
} from "./schedulePublicationEmailContent";
import type { SchedulePublicationServingAreaBlock } from "../email/sendSchedulePublicationEmail";

export interface SchedulePublicationEmailSummary {
  emailsSent: number;
  skippedMissingEmail: number;
}

interface VolunteerPublishBundle {
  submissionId: number;
  firstName: string;
  email: string | null;
  assignments: GeneratedSchedulePublishAssignmentRow[];
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const trimmed = email.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function buildEventBlocks(
  env: Env,
  submissionId: number,
  volunteerAssignments: GeneratedSchedulePublishAssignmentRow[],
  data: NonNullable<Awaited<ReturnType<typeof loadGeneratedSchedulePublishEmailData>>>
): Promise<SchedulePublicationEventBlock[]> {
  const byOccurrence = new Map<number, GeneratedSchedulePublishAssignmentRow[]>();

  for (const assignment of volunteerAssignments) {
    const list = byOccurrence.get(assignment.occurrenceId) ?? [];
    list.push(assignment);
    byOccurrence.set(assignment.occurrenceId, list);
  }

  const blocks: SchedulePublicationEventBlock[] = [];

  const sortedOccurrenceIds = [...byOccurrence.keys()].sort((a, b) => {
    const aDate = byOccurrence.get(a)?.[0]?.occurrenceDate ?? "";
    const bDate = byOccurrence.get(b)?.[0]?.occurrenceDate ?? "";
    return aDate.localeCompare(bDate) || a - b;
  });

  for (const occurrenceId of sortedOccurrenceIds) {
    const rows = byOccurrence.get(occurrenceId) ?? [];
    const first = rows[0];

    if (!first) {
      continue;
    }

    const notesBucket = data.notesByOccurrence.get(occurrenceId);
    const resourcesBucket = data.resourcesByOccurrence.get(occurrenceId);

    const generalNotes = notesBucket ? [...notesBucket.general] : [];
    const generalResources = await buildResourceDownloadLinks(
      env,
      data.header.organizationId,
      submissionId,
      resourcesBucket ? [...resourcesBucket.general] : []
    );

    const servingAreas: SchedulePublicationServingAreaBlock[] = [];

    for (const row of rows) {
      const areaNotes =
        row.scheduleServingAreaId && notesBucket
          ? [...(notesBucket.byArea.get(row.scheduleServingAreaId) ?? [])]
          : [];

      const areaResourceItems =
        row.scheduleServingAreaId && resourcesBucket
          ? [...(resourcesBucket.byArea.get(row.scheduleServingAreaId) ?? [])]
          : [];

      servingAreas.push({
        servingAreaName: row.servingAreaName,
        notes: areaNotes,
        resources: await buildResourceDownloadLinks(
          env,
          data.header.organizationId,
          submissionId,
          areaResourceItems
        )
      });
    }

    blocks.push({
      occurrenceDate: first.occurrenceDate,
      occurrenceName: first.occurrenceName,
      startTime: first.startTime,
      generalNotes,
      generalResources,
      servingAreas
    });
  }

  return blocks;
}

export async function sendGeneratedSchedulePublicationEmails(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<SchedulePublicationEmailSummary> {
  const data = await loadGeneratedSchedulePublishEmailData(
    env,
    organizationId,
    generatedScheduleId
  );

  if (!data) {
    return { emailsSent: 0, skippedMissingEmail: 0 };
  }

  if (data.header.organizationSlug === DEMO_ORGANIZATION_SLUG) {
    return { emailsSent: 0, skippedMissingEmail: 0 };
  }

  const byVolunteer = new Map<number, VolunteerPublishBundle>();

  for (const row of data.assignments) {
    const existing = byVolunteer.get(row.submissionId);

    if (existing) {
      existing.assignments.push(row);
      continue;
    }

    byVolunteer.set(row.submissionId, {
      submissionId: row.submissionId,
      firstName: row.firstName,
      email: row.email,
      assignments: [row]
    });
  }

  let emailsSent = 0;
  let skippedMissingEmail = 0;

  for (const volunteer of byVolunteer.values()) {
    const to = normalizeEmail(volunteer.email);

    if (!to) {
      skippedMissingEmail += 1;
      continue;
    }

    const events = await buildEventBlocks(
      env,
      volunteer.submissionId,
      volunteer.assignments,
      data
    );

    const sent = await sendSchedulePublicationEmail(env, {
      to,
      firstName: volunteer.firstName,
      scheduleName: data.header.scheduleName,
      events
    });

    if (sent) {
      emailsSent += 1;
    }
  }

  return { emailsSent, skippedMissingEmail };
}
