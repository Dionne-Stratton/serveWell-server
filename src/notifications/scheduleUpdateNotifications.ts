import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import {
  clearPendingVolunteerUpdatesForSchedule,
  insertPendingVolunteerUpdate,
  listPendingVolunteerUpdatesForSchedule
} from "../db/generatedSchedulePendingVolunteerUpdates";
import type { AssignmentRemovalSnapshot, OccurrenceEmailMeta } from "../db/generatedScheduleUpdateNotify";
import {
  getPublishedScheduleHeader,
  getVolunteerAssignmentOnOccurrence,
  getVolunteerContact,
  listAffectedSubmissionIdsForScope,
  listPriorScheduleAssignmentsForSubmission
} from "../db/generatedScheduleUpdateNotify";
import type { SchedulePublicationEventBlock } from "../email/scheduleEmailEventBodies";
import type { SchedulePublicationResourceLink } from "../email/scheduleEmailEventBodies";
import { sendScheduleUpdateEmail } from "../email/sendScheduleUpdateEmail";
import type { Env } from "../types";
import type { SchedulePendingVolunteerUpdatePayload } from "./schedulePendingVolunteerUpdatePayload";
import { buildResourceDownloadLinks } from "./schedulePublicationEmailContent";
import { buildPublicationEventBlocksForVolunteer } from "./schedulePublicationEmails";
import type {
  ScheduleContentChangeAction,
  ScheduleContentScope,
  ScheduleContentScopeChange
} from "./scheduleVolunteerUpdateTypes";

export type { ScheduleContentChangeAction, ScheduleContentScope, ScheduleContentScopeChange };

interface ResourceChangeItem {
  action: ScheduleContentChangeAction;
  resourceId?: number;
  label: string;
}

export interface SendConsolidatedVolunteerUpdatesSummary {
  emailsSent: number;
  skippedMissingEmail: number;
  sendFailures: number;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const trimmed = email.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function changePrefix(action: ScheduleContentChangeAction): string {
  if (action === "added") {
    return "(Added)";
  }

  if (action === "updated") {
    return "(Updated)";
  }

  return "(Removed)";
}

export function mergeScheduleUpdateEventBlocks(
  events: SchedulePublicationEventBlock[]
): SchedulePublicationEventBlock[] {
  if (events.length === 0) {
    return [];
  }

  const byOccurrence = new Map<string, SchedulePublicationEventBlock>();

  for (const event of events) {
    const key = `${event.occurrenceDate}|${event.occurrenceName}|${event.startTime}`;
    const existing = byOccurrence.get(key);

    if (!existing) {
      byOccurrence.set(key, {
        ...event,
        generalNotes: [...event.generalNotes],
        generalResources: [...event.generalResources],
        servingAreas: event.servingAreas.map((area) => ({
          ...area,
          notes: [...area.notes],
          resources: [...area.resources]
        })),
        statusLines: event.statusLines ? [...event.statusLines] : undefined
      });
      continue;
    }

    existing.generalNotes.push(...event.generalNotes);
    existing.generalResources.push(...event.generalResources);

    if (event.statusLines?.length) {
      existing.statusLines = [...(existing.statusLines ?? []), ...event.statusLines];
    }

    for (const area of event.servingAreas) {
      const match = existing.servingAreas.find(
        (candidate) => candidate.servingAreaName === area.servingAreaName
      );

      if (match) {
        match.notes.push(...area.notes);
        match.resources.push(...area.resources);
      } else {
        existing.servingAreas.push({
          servingAreaName: area.servingAreaName,
          notes: [...area.notes],
          resources: [...area.resources]
        });
      }
    }
  }

  return [...byOccurrence.values()];
}

async function resourceLinksForChanges(
  env: Env,
  organizationId: number,
  submissionId: number,
  resourceChanges: ResourceChangeItem[]
): Promise<SchedulePublicationResourceLink[]> {
  const downloadable = resourceChanges.filter(
    (item) => item.action !== "removed" && item.resourceId != null
  );

  const links = await buildResourceDownloadLinks(
    env,
    organizationId,
    submissionId,
    downloadable.map((item) => ({ id: item.resourceId!, label: item.label }))
  );

  const linkById = new Map(
    downloadable.map((item, index) => [item.resourceId!, links[index]])
  );

  const result: SchedulePublicationResourceLink[] = [];

  for (const item of resourceChanges) {
    if (item.action === "removed") {
      result.push({ label: `${changePrefix("removed")} ${item.label}` });
      continue;
    }

    if (item.resourceId == null) {
      continue;
    }

    const link = linkById.get(item.resourceId);

    if (link) {
      result.push(link);
    }
  }

  return result;
}

async function buildContentChangeEventForVolunteer(
  env: Env,
  organizationId: number,
  submissionId: number,
  occurrence: OccurrenceEmailMeta,
  scope: ScheduleContentScope,
  noteChanges: { action: ScheduleContentChangeAction; text: string }[],
  resourceChanges: ResourceChangeItem[]
): Promise<SchedulePublicationEventBlock> {
  const assignment = await getVolunteerAssignmentOnOccurrence(
    env,
    occurrence.occurrenceId,
    submissionId
  );

  const generalNotes: string[] = [];
  const areaNotes: string[] = [];
  let generalResources: SchedulePublicationResourceLink[] = [];
  let areaResources: SchedulePublicationResourceLink[] = [];

  if (scope.scheduleServingAreaId == null) {
    for (const change of noteChanges) {
      generalNotes.push(`${changePrefix(change.action)} ${change.text}`);
    }

    generalResources = await resourceLinksForChanges(
      env,
      organizationId,
      submissionId,
      resourceChanges
    );
  } else {
    for (const change of noteChanges) {
      areaNotes.push(`${changePrefix(change.action)} ${change.text}`);
    }

    areaResources = await resourceLinksForChanges(
      env,
      organizationId,
      submissionId,
      resourceChanges
    );
  }

  const servingAreas =
    scope.scheduleServingAreaId != null
      ? [
          {
            servingAreaName:
              scope.servingAreaDisplayName?.trim() ||
              assignment?.servingAreaName ||
              "Serving area",
            notes: areaNotes,
            resources: areaResources
          }
        ]
      : assignment
        ? [
            {
              servingAreaName: assignment.servingAreaName,
              notes: [],
              resources: []
            }
          ]
        : [];

  return {
    occurrenceDate: occurrence.occurrenceDate,
    occurrenceName: occurrence.occurrenceName,
    startTime: occurrence.startTime,
    generalNotes,
    generalResources,
    servingAreas
  };
}

async function buildEventsFromPendingPayload(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  submissionId: number,
  payload: SchedulePendingVolunteerUpdatePayload
): Promise<SchedulePublicationEventBlock[]> {
  if (payload.kind === "assignment_added") {
    const events = await buildPublicationEventBlocksForVolunteer(
      env,
      organizationId,
      generatedScheduleId,
      submissionId,
      { occurrenceId: payload.occurrenceId, requirementId: payload.requirementId }
    );

    if (payload.movedFrom && events.length > 0) {
      events[0].statusLines = [
        `Your assignment changed from ${payload.movedFrom.servingAreaName} (${payload.movedFrom.occurrenceName}) to ${events[0].servingAreas[0]?.servingAreaName ?? "a new serving area"} (${events[0].occurrenceName}).`
      ];
    } else if (events.length > 0) {
      events[0].statusLines = [
        `You have been assigned to ${events[0].servingAreas[0]?.servingAreaName ?? "a serving area"}.`
      ];
    }

    return events;
  }

  if (payload.kind === "assignment_removed") {
    const removed = payload.removed;

    return [
      {
        occurrenceDate: removed.occurrence.occurrenceDate,
        occurrenceName: removed.occurrence.occurrenceName,
        startTime: removed.occurrence.startTime,
        generalNotes: [],
        generalResources: [],
        servingAreas: [
          {
            servingAreaName: removed.servingAreaName,
            notes: [],
            resources: []
          }
        ],
        statusLines: [`You are no longer scheduled for ${removed.servingAreaName} on this event.`]
      }
    ];
  }

  const events: SchedulePublicationEventBlock[] = [];

  for (const change of payload.scopeChanges) {
    const affected = await listAffectedSubmissionIdsForScope(
      env,
      payload.occurrence.occurrenceId,
      change.scope.scheduleServingAreaId
    );

    if (!affected.includes(submissionId)) {
      continue;
    }

    if (change.noteChanges.length === 0 && change.resourceChanges.length === 0) {
      continue;
    }

    events.push(
      await buildContentChangeEventForVolunteer(
        env,
        organizationId,
        submissionId,
        payload.occurrence,
        change.scope,
        change.noteChanges,
        change.resourceChanges
      )
    );
  }

  return events;
}

export async function queueScheduleAssignmentAdded(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  requirementId: number,
  submissionId: number,
  priorAssignments: Awaited<ReturnType<typeof listPriorScheduleAssignmentsForSubmission>>
): Promise<void> {
  const header = await getPublishedScheduleHeader(env, organizationId, generatedScheduleId);

  if (!header) {
    return;
  }

  const movedFrom =
    priorAssignments.find(
      (prior) => prior.requirementId !== requirementId || prior.occurrenceId !== occurrenceId
    ) ?? null;

  await insertPendingVolunteerUpdate(env, organizationId, generatedScheduleId, submissionId, {
    kind: "assignment_added",
    occurrenceId,
    requirementId,
    movedFrom
  });
}

export async function queueScheduleAssignmentRemoved(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  removed: AssignmentRemovalSnapshot
): Promise<void> {
  const header = await getPublishedScheduleHeader(env, organizationId, generatedScheduleId);

  if (!header) {
    return;
  }

  await insertPendingVolunteerUpdate(
    env,
    organizationId,
    generatedScheduleId,
    removed.submissionId,
    {
      kind: "assignment_removed",
      removed
    }
  );
}

export async function queueScheduleContentChanges(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrence: OccurrenceEmailMeta,
  scopeChanges: ScheduleContentScopeChange[]
): Promise<void> {
  const header = await getPublishedScheduleHeader(env, organizationId, generatedScheduleId);

  if (!header || scopeChanges.length === 0) {
    return;
  }

  const submissionIds = new Set<number>();

  for (const change of scopeChanges) {
    for (const id of await listAffectedSubmissionIdsForScope(
      env,
      occurrence.occurrenceId,
      change.scope.scheduleServingAreaId
    )) {
      submissionIds.add(id);
    }
  }

  const payload: SchedulePendingVolunteerUpdatePayload = {
    kind: "content",
    occurrence,
    scopeChanges
  };

  for (const submissionId of submissionIds) {
    await insertPendingVolunteerUpdate(
      env,
      organizationId,
      generatedScheduleId,
      submissionId,
      payload
    );
  }
}

export async function sendConsolidatedScheduleVolunteerUpdates(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<
  | { status: "not_found" }
  | { status: "not_published" }
  | { status: "nothing_pending" }
  | { status: "ok"; summary: SendConsolidatedVolunteerUpdatesSummary }
  | { status: "send_failed"; summary: SendConsolidatedVolunteerUpdatesSummary }
> {
  const header = await getPublishedScheduleHeader(env, organizationId, generatedScheduleId);

  if (!header) {
    const exists = await env.DB.prepare(
      `SELECT id FROM generated_schedules WHERE id = ? AND organization_id = ? LIMIT 1`
    )
      .bind(generatedScheduleId, organizationId)
      .first<{ id: number }>();

    if (!exists) {
      return { status: "not_found" };
    }

    return { status: "not_published" };
  }

  const pending = await listPendingVolunteerUpdatesForSchedule(
    env,
    organizationId,
    generatedScheduleId
  );

  if (pending.length === 0) {
    await clearPendingVolunteerUpdatesForSchedule(env, organizationId, generatedScheduleId);
    return { status: "nothing_pending" };
  }

  if (header.organizationSlug === DEMO_ORGANIZATION_SLUG) {
    await clearPendingVolunteerUpdatesForSchedule(env, organizationId, generatedScheduleId);
    return {
      status: "ok",
      summary: { emailsSent: 0, skippedMissingEmail: 0, sendFailures: 0 }
    };
  }

  const bySubmission = new Map<number, SchedulePendingVolunteerUpdatePayload[]>();

  for (const row of pending) {
    const list = bySubmission.get(row.submissionId) ?? [];
    list.push(row.payload);
    bySubmission.set(row.submissionId, list);
  }

  const summary: SendConsolidatedVolunteerUpdatesSummary = {
    emailsSent: 0,
    skippedMissingEmail: 0,
    sendFailures: 0
  };

  for (const [submissionId, payloads] of bySubmission) {
    const contact = await getVolunteerContact(env, organizationId, submissionId);

    if (!contact) {
      continue;
    }

    const to = normalizeEmail(contact.email);

    if (!to) {
      summary.skippedMissingEmail += 1;
      continue;
    }

    const eventParts: SchedulePublicationEventBlock[] = [];

    for (const payload of payloads) {
      eventParts.push(
        ...(await buildEventsFromPendingPayload(
          env,
          organizationId,
          generatedScheduleId,
          submissionId,
          payload
        ))
      );
    }

    const events = mergeScheduleUpdateEventBlocks(eventParts);

    if (events.length === 0) {
      continue;
    }

    const sent = await sendScheduleUpdateEmail(env, {
      to,
      firstName: contact.firstName,
      scheduleName: header.scheduleName,
      events
    });

    if (sent) {
      summary.emailsSent += 1;
    } else {
      summary.sendFailures += 1;
    }
  }

  if (summary.sendFailures > 0) {
    return { status: "send_failed", summary };
  }

  await clearPendingVolunteerUpdatesForSchedule(env, organizationId, generatedScheduleId);

  return { status: "ok", summary };
}

export { listPriorScheduleAssignmentsForSubmission };
