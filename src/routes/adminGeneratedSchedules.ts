import { requireAdmin } from "../auth/adminGuard";
import {
  archiveGeneratedSchedule,
  createGeneratedScheduleFromTemplate,
  deleteGeneratedSchedule,
  getGeneratedScheduleDetail,
  getGeneratedScheduleOccurrenceDetail,
  listGeneratedSchedules,
  publishGeneratedSchedule,
  replaceGeneratedScheduleOccurrenceStaffing
} from "../db/adminGeneratedSchedules";
import {
  createOccurrenceAssignment,
  deleteOccurrenceAssignment,
  listEligibleVolunteersForRequirement
} from "../db/adminGeneratedOccurrenceAssignments";
import {
  createGeneratedOccurrenceNote,
  deleteGeneratedOccurrenceNote,
  updateGeneratedOccurrenceNote
} from "../db/adminGeneratedOccurrenceNotes";
import type { MutateOccurrenceNoteResult } from "../db/adminGeneratedOccurrenceNotes";
import {
  createGeneratedOccurrenceResource,
  deleteGeneratedOccurrenceResource,
  getGeneratedOccurrenceResourceDownload,
  updateGeneratedOccurrenceResource
} from "../db/adminGeneratedOccurrenceResources";
import type { MutateOccurrenceResourceResult } from "../db/adminGeneratedOccurrenceResources";
import { clearPendingVolunteerUpdatesForSchedule } from "../db/generatedSchedulePendingVolunteerUpdates";
import {
  getOccurrenceEmailMeta,
  loadAssignmentRemovalSnapshot,
  loadOccurrenceNoteSnapshot,
  loadOccurrenceResourceSnapshot,
  listPriorScheduleAssignmentsForSubmission,
  resourceDisplayLabel,
  scopeWithDisplayName
} from "../db/generatedScheduleUpdateNotify";
import { autoAssignGeneratedSchedule } from "../scheduling/autoAssignGeneratedSchedule";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import { rejectIfGeneratedScheduleArchived } from "../lib/generatedScheduleEditGuard";
import { sendGeneratedSchedulePublicationEmails } from "../notifications/schedulePublicationEmails";
import {
  queueScheduleAssignmentAdded,
  queueScheduleAssignmentRemoved,
  queueScheduleContentChanges,
  sendConsolidatedScheduleVolunteerUpdates,
  type ScheduleContentScopeChange
} from "../notifications/scheduleUpdateNotifications";
import type { Env } from "../types";
import {
  validateCreateGeneratedScheduleBody,
  validateRangeForTemplateType
} from "../validation/generatedSchedules";
import { validateUpdateOccurrenceStaffingBody } from "../validation/generatedOccurrenceStaffing";
import { validateOccurrenceNoteBody } from "../validation/generatedOccurrenceNotes";
import {
  isOccurrenceResourceUploadFile,
  parseOptionalDisplayNameFromForm,
  parseOptionalScheduleServingAreaIdFromForm,
  validateOccurrenceResourceMetadataBody
} from "../validation/generatedOccurrenceResources";
import type { ScheduleType } from "../validation/schedules";

async function tryQueueScheduleContentChanges(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  scopeChanges: ScheduleContentScopeChange[]
): Promise<void> {
  try {
    const occurrence = await getOccurrenceEmailMeta(
      env,
      organizationId,
      generatedScheduleId,
      occurrenceId
    );

    if (!occurrence) {
      return;
    }

    await queueScheduleContentChanges(
      env,
      organizationId,
      generatedScheduleId,
      occurrence,
      scopeChanges
    );
  } catch (error) {
    console.error("Failed to queue schedule update notifications", error);
  }
}

export async function tryAdminGeneratedSchedulesRoute(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  if (pathname === "/api/admin/generated-schedules") {
    if (request.method === "GET") {
      return listGenerated(request, env);
    }

    if (request.method === "POST") {
      return postGenerated(request, env);
    }

    return methodNotAllowed();
  }

  const eligibleMatch = pathname.match(
    /^\/api\/admin\/generated-schedules\/(\d+)\/occurrences\/(\d+)\/requirements\/(\d+)\/eligible-volunteers$/
  );

  if (eligibleMatch) {
    const generatedScheduleId = Number(eligibleMatch[1]);
    const occurrenceId = Number(eligibleMatch[2]);
    const requirementId = Number(eligibleMatch[3]);

    if (
      !Number.isInteger(generatedScheduleId) ||
      generatedScheduleId < 1 ||
      !Number.isInteger(occurrenceId) ||
      occurrenceId < 1 ||
      !Number.isInteger(requirementId) ||
      requirementId < 1
    ) {
      return notFound();
    }

    if (request.method === "GET") {
      return getEligibleVolunteers(
        request,
        env,
        generatedScheduleId,
        occurrenceId,
        requirementId
      );
    }

    return methodNotAllowed();
  }

  const assignmentMatch = pathname.match(
    /^\/api\/admin\/generated-schedules\/(\d+)\/occurrences\/(\d+)\/assignments(?:\/(\d+))?$/
  );

  if (assignmentMatch) {
    const generatedScheduleId = Number(assignmentMatch[1]);
    const occurrenceId = Number(assignmentMatch[2]);
    const assignmentId = assignmentMatch[3] ? Number(assignmentMatch[3]) : null;

    if (
      !Number.isInteger(generatedScheduleId) ||
      generatedScheduleId < 1 ||
      !Number.isInteger(occurrenceId) ||
      occurrenceId < 1
    ) {
      return notFound();
    }

    if (assignmentId === null && request.method === "POST") {
      return postOccurrenceAssignment(request, env, generatedScheduleId, occurrenceId);
    }

    if (
      assignmentId !== null &&
      Number.isInteger(assignmentId) &&
      assignmentId >= 1 &&
      request.method === "DELETE"
    ) {
      return deleteOccurrenceAssignmentRoute(
        request,
        env,
        generatedScheduleId,
        occurrenceId,
        assignmentId
      );
    }

    return methodNotAllowed();
  }

  const resourceDownloadMatch = pathname.match(
    /^\/api\/admin\/generated-schedules\/(\d+)\/occurrences\/(\d+)\/resources\/(\d+)\/download$/
  );

  if (resourceDownloadMatch) {
    const generatedScheduleId = Number(resourceDownloadMatch[1]);
    const occurrenceId = Number(resourceDownloadMatch[2]);
    const resourceId = Number(resourceDownloadMatch[3]);

    if (
      !Number.isInteger(generatedScheduleId) ||
      generatedScheduleId < 1 ||
      !Number.isInteger(occurrenceId) ||
      occurrenceId < 1 ||
      !Number.isInteger(resourceId) ||
      resourceId < 1
    ) {
      return notFound();
    }

    if (request.method === "GET") {
      return getGeneratedOccurrenceResourceDownloadRoute(
        request,
        env,
        generatedScheduleId,
        occurrenceId,
        resourceId
      );
    }

    return methodNotAllowed();
  }

  const resourcesMatch = pathname.match(
    /^\/api\/admin\/generated-schedules\/(\d+)\/occurrences\/(\d+)\/resources(?:\/(\d+))?$/
  );

  if (resourcesMatch) {
    const generatedScheduleId = Number(resourcesMatch[1]);
    const occurrenceId = Number(resourcesMatch[2]);
    const resourceId = resourcesMatch[3] ? Number(resourcesMatch[3]) : null;

    if (
      !Number.isInteger(generatedScheduleId) ||
      generatedScheduleId < 1 ||
      !Number.isInteger(occurrenceId) ||
      occurrenceId < 1
    ) {
      return notFound();
    }

    if (resourceId === null && request.method === "POST") {
      return postGeneratedOccurrenceResource(request, env, generatedScheduleId, occurrenceId);
    }

    if (
      resourceId !== null &&
      Number.isInteger(resourceId) &&
      resourceId >= 1 &&
      request.method === "PATCH"
    ) {
      return patchGeneratedOccurrenceResource(
        request,
        env,
        generatedScheduleId,
        occurrenceId,
        resourceId
      );
    }

    if (
      resourceId !== null &&
      Number.isInteger(resourceId) &&
      resourceId >= 1 &&
      request.method === "DELETE"
    ) {
      return deleteGeneratedOccurrenceResourceRoute(
        request,
        env,
        generatedScheduleId,
        occurrenceId,
        resourceId
      );
    }

    return methodNotAllowed();
  }

  const notesMatch = pathname.match(
    /^\/api\/admin\/generated-schedules\/(\d+)\/occurrences\/(\d+)\/notes(?:\/(\d+))?$/
  );

  if (notesMatch) {
    const generatedScheduleId = Number(notesMatch[1]);
    const occurrenceId = Number(notesMatch[2]);
    const noteId = notesMatch[3] ? Number(notesMatch[3]) : null;

    if (
      !Number.isInteger(generatedScheduleId) ||
      generatedScheduleId < 1 ||
      !Number.isInteger(occurrenceId) ||
      occurrenceId < 1
    ) {
      return notFound();
    }

    if (noteId === null && request.method === "POST") {
      return postGeneratedOccurrenceNote(request, env, generatedScheduleId, occurrenceId);
    }

    if (
      noteId !== null &&
      Number.isInteger(noteId) &&
      noteId >= 1 &&
      request.method === "PATCH"
    ) {
      return patchGeneratedOccurrenceNote(
        request,
        env,
        generatedScheduleId,
        occurrenceId,
        noteId
      );
    }

    if (
      noteId !== null &&
      Number.isInteger(noteId) &&
      noteId >= 1 &&
      request.method === "DELETE"
    ) {
      return deleteGeneratedOccurrenceNoteRoute(
        request,
        env,
        generatedScheduleId,
        occurrenceId,
        noteId
      );
    }

    return methodNotAllowed();
  }

  const occurrenceMatch = pathname.match(
    /^\/api\/admin\/generated-schedules\/(\d+)\/occurrences\/(\d+)$/
  );

  if (occurrenceMatch) {
    const generatedScheduleId = Number(occurrenceMatch[1]);
    const occurrenceId = Number(occurrenceMatch[2]);

    if (
      !Number.isInteger(generatedScheduleId) ||
      generatedScheduleId < 1 ||
      !Number.isInteger(occurrenceId) ||
      occurrenceId < 1
    ) {
      return notFound();
    }

    if (request.method === "GET") {
      return getGeneratedOccurrence(request, env, generatedScheduleId, occurrenceId);
    }

    if (request.method === "PATCH") {
      return patchGeneratedOccurrence(request, env, generatedScheduleId, occurrenceId);
    }

    return methodNotAllowed();
  }

  const sendVolunteerUpdatesMatch = pathname.match(
    /^\/api\/admin\/generated-schedules\/(\d+)\/send-volunteer-updates$/
  );

  if (sendVolunteerUpdatesMatch) {
    const generatedScheduleId = Number(sendVolunteerUpdatesMatch[1]);

    if (!Number.isInteger(generatedScheduleId) || generatedScheduleId < 1) {
      return notFound();
    }

    if (request.method === "POST") {
      return postSendVolunteerUpdates(request, env, generatedScheduleId);
    }

    return methodNotAllowed();
  }

  const publishMatch = pathname.match(/^\/api\/admin\/generated-schedules\/(\d+)\/publish$/);

  if (publishMatch) {
    const generatedScheduleId = Number(publishMatch[1]);

    if (!Number.isInteger(generatedScheduleId) || generatedScheduleId < 1) {
      return notFound();
    }

    if (request.method === "POST") {
      return postPublishGenerated(request, env, generatedScheduleId);
    }

    return methodNotAllowed();
  }

  const archiveMatch = pathname.match(/^\/api\/admin\/generated-schedules\/(\d+)\/archive$/);

  if (archiveMatch) {
    const generatedScheduleId = Number(archiveMatch[1]);

    if (!Number.isInteger(generatedScheduleId) || generatedScheduleId < 1) {
      return notFound();
    }

    if (request.method === "POST") {
      return postArchiveGenerated(request, env, generatedScheduleId);
    }

    return methodNotAllowed();
  }

  const detailMatch = pathname.match(/^\/api\/admin\/generated-schedules\/(\d+)$/);

  if (detailMatch) {
    const generatedScheduleId = Number(detailMatch[1]);

    if (!Number.isInteger(generatedScheduleId) || generatedScheduleId < 1) {
      return notFound();
    }

    if (request.method === "GET") {
      return getGenerated(request, env, generatedScheduleId);
    }

    if (request.method === "DELETE") {
      return deleteGenerated(request, env, generatedScheduleId);
    }

    return methodNotAllowed();
  }

  return null;
}

async function listGenerated(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const generatedSchedules = await listGeneratedSchedules(env, auth.admin!.organizationId);

    return json({
      success: true,
      data: { generatedSchedules }
    });
  } catch (error) {
    console.error("Failed to list generated schedules", error);
    return serverError("Unable to load generated schedules.");
  }
}

async function getGenerated(
  request: Request,
  env: Env,
  generatedScheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const detail = await getGeneratedScheduleDetail(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    if (!detail) {
      return notFound();
    }

    return json({
      success: true,
      data: { generatedSchedule: detail }
    });
  } catch (error) {
    console.error("Failed to load generated schedule", error);
    return serverError("Unable to load generated schedule.");
  }
}

async function postPublishGenerated(
  request: Request,
  env: Env,
  generatedScheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const result = await publishGeneratedSchedule(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    if (result.status === "not_found") {
      return notFound();
    }

    if (result.status === "not_draft") {
      return badRequest(
        "Only draft schedules can be published.",
        "SCHEDULE_NOT_DRAFT"
      );
    }

    await clearPendingVolunteerUpdatesForSchedule(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    const publicationEmails = await sendGeneratedSchedulePublicationEmails(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    return json({
      success: true,
      data: {
        generatedSchedule: result.detail,
        publicationEmails
      }
    });
  } catch (error) {
    console.error("Failed to publish generated schedule", error);
    return serverError("Unable to publish schedule.");
  }
}

async function postArchiveGenerated(
  request: Request,
  env: Env,
  generatedScheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const result = await archiveGeneratedSchedule(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    if (result.status === "not_found") {
      return notFound();
    }

    if (result.status === "already_archived") {
      return badRequest("This schedule is already archived.", "SCHEDULE_ALREADY_ARCHIVED");
    }

    if (result.status === "not_published") {
      return badRequest(
        "Only published schedules can be archived.",
        "SCHEDULE_NOT_PUBLISHED"
      );
    }

    await clearPendingVolunteerUpdatesForSchedule(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    return json({
      success: true,
      data: { generatedSchedule: result.detail }
    });
  } catch (error) {
    console.error("Failed to archive generated schedule", error);
    return serverError("Unable to archive schedule.");
  }
}

async function postSendVolunteerUpdates(
  request: Request,
  env: Env,
  generatedScheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const result = await sendConsolidatedScheduleVolunteerUpdates(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    if (result.status === "not_found") {
      return notFound();
    }

    if (result.status === "not_published") {
      return badRequest(
        "Only published schedules can send volunteer updates.",
        "SCHEDULE_NOT_PUBLISHED"
      );
    }

    if (result.status === "nothing_pending") {
      return badRequest("There are no unsent volunteer updates.", "NO_PENDING_UPDATES");
    }

    if (result.status === "send_failed") {
      return serverError("Unable to send one or more volunteer update emails.");
    }

    const detail = await getGeneratedScheduleDetail(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    if (!detail) {
      return notFound();
    }

    return json({
      success: true,
      data: {
        generatedSchedule: detail,
        volunteerUpdateEmails: result.summary
      }
    });
  } catch (error) {
    console.error("Failed to send volunteer schedule updates", error);
    return serverError("Unable to send volunteer updates.");
  }
}

async function deleteGenerated(
  request: Request,
  env: Env,
  generatedScheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const deleted = await deleteGeneratedSchedule(
      env,
      auth.admin!.organizationId,
      generatedScheduleId
    );

    if (!deleted) {
      return notFound();
    }

    return json({
      success: true,
      data: { deleted: true }
    });
  } catch (error) {
    console.error("Failed to delete generated schedule", error);
    return serverError("Unable to delete schedule.");
  }
}

async function postGenerated(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const parsed = validateCreateGeneratedScheduleBody(body);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  const record = body as Record<string, unknown>;
  const usedMonthYear =
    record.month !== undefined &&
    record.month !== null &&
    record.year !== undefined &&
    record.year !== null;

  try {
    const template = await env.DB.prepare(
      `
      SELECT schedule_type
      FROM schedules
      WHERE id = ? AND organization_id = ?
      LIMIT 1
      `
    )
      .bind(parsed.value.scheduleTemplateId, auth.admin!.organizationId)
      .first<{ schedule_type: string }>();

    if (!template) {
      return badRequest("Schedule template not found.");
    }

    const typeError = validateRangeForTemplateType(
      template.schedule_type as ScheduleType,
      parsed.value,
      usedMonthYear
    );

    if (typeError) {
      return badRequest(typeError);
    }

    const created = await createGeneratedScheduleFromTemplate(
      env,
      auth.admin!.organizationId,
      parsed.value
    );

    if (!created) {
      return serverError("Unable to create generated schedule.");
    }

    const autoAssignSummary = await autoAssignGeneratedSchedule(
      env,
      auth.admin!.organizationId,
      created.id
    );

    const detail = await getGeneratedScheduleDetail(
      env,
      auth.admin!.organizationId,
      created.id
    );

    return json(
      {
        success: true,
        data: {
          generatedSchedule: detail ?? created,
          autoAssignSummary
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "NO_RHYTHMS") {
        return badRequest("Template has no events. Add events to the template first.");
      }

      if (error.message === "NO_OCCURRENCES") {
        return badRequest(
          "No service dates fall in the selected range for this template’s events."
        );
      }
    }

    console.error("Failed to create generated schedule", error);
    return serverError("Unable to create generated schedule.");
  }
}

async function occurrenceAfterNoteMutation(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  result: MutateOccurrenceNoteResult
): Promise<Response> {
  if (result.status === "not_found") {
    return notFound();
  }

  if (result.status === "invalid_serving_area") {
    return badRequest(
      "Choose a serving area that has staffing needs on this event.",
      "INVALID_SERVING_AREA"
    );
  }

  if (result.status === "note_not_found") {
    return notFound();
  }

  const occurrence = await getGeneratedScheduleOccurrenceDetail(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!occurrence) {
    return notFound();
  }

  return json({
    success: true,
    data: { occurrence }
  });
}

async function postGeneratedOccurrenceNote(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  const validation = validateOccurrenceNoteBody(body);

  if (typeof validation === "string") {
    return badRequest(validation);
  }

  try {
    const result = await createGeneratedOccurrenceNote(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      validation
    );

    if (result.status === "ok") {
      const scope = await scopeWithDisplayName(
        env,
        auth.admin!.organizationId,
        validation.scheduleServingAreaId
      );

      await tryQueueScheduleContentChanges(
        env,
        auth.admin!.organizationId,
        generatedScheduleId,
        occurrenceId,
        [
          {
            scope,
            noteChanges: [{ action: "added", text: validation.note }],
            resourceChanges: []
          }
        ]
      );
    }

    return occurrenceAfterNoteMutation(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      result
    );
  } catch (error) {
    console.error("Failed to create occurrence note", error);
    return serverError("Unable to save note.");
  }
}

async function patchGeneratedOccurrenceNote(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number,
  noteId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  const validation = validateOccurrenceNoteBody(body);

  if (typeof validation === "string") {
    return badRequest(validation);
  }

  try {
    const priorNote = await loadOccurrenceNoteSnapshot(
      env,
      auth.admin!.organizationId,
      occurrenceId,
      noteId
    );

    const result = await updateGeneratedOccurrenceNote(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      noteId,
      validation
    );

    if (result.status === "ok") {
      const newScope = await scopeWithDisplayName(
        env,
        auth.admin!.organizationId,
        validation.scheduleServingAreaId
      );
      const scopeChanges: ScheduleContentScopeChange[] = [];

      if (
        priorNote &&
        priorNote.scheduleServingAreaId !== validation.scheduleServingAreaId
      ) {
        const oldScope = await scopeWithDisplayName(
          env,
          auth.admin!.organizationId,
          priorNote.scheduleServingAreaId
        );

        scopeChanges.push(
          {
            scope: oldScope,
            noteChanges: [{ action: "removed", text: priorNote.note }],
            resourceChanges: []
          },
          {
            scope: newScope,
            noteChanges: [{ action: "added", text: validation.note }],
            resourceChanges: []
          }
        );
      } else {
        scopeChanges.push({
          scope: newScope,
          noteChanges: [{ action: "updated", text: validation.note }],
          resourceChanges: []
        });
      }

      await tryQueueScheduleContentChanges(
        env,
        auth.admin!.organizationId,
        generatedScheduleId,
        occurrenceId,
        scopeChanges
      );
    }

    return occurrenceAfterNoteMutation(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      result
    );
  } catch (error) {
    console.error("Failed to update occurrence note", error);
    return serverError("Unable to save note.");
  }
}

async function deleteGeneratedOccurrenceNoteRoute(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number,
  noteId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  try {
    const priorNote = await loadOccurrenceNoteSnapshot(
      env,
      auth.admin!.organizationId,
      occurrenceId,
      noteId
    );

    const result = await deleteGeneratedOccurrenceNote(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      noteId
    );

    if (result.status === "ok" && priorNote) {
      const scope = await scopeWithDisplayName(
        env,
        auth.admin!.organizationId,
        priorNote.scheduleServingAreaId
      );

      await tryQueueScheduleContentChanges(
        env,
        auth.admin!.organizationId,
        generatedScheduleId,
        occurrenceId,
        [
          {
            scope,
            noteChanges: [{ action: "removed", text: priorNote.note }],
            resourceChanges: []
          }
        ]
      );
    }

    return occurrenceAfterNoteMutation(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      result
    );
  } catch (error) {
    console.error("Failed to delete occurrence note", error);
    return serverError("Unable to delete note.");
  }
}

function contentDispositionAttachment(filename: string): string {
  const safe = filename.replace(/[\r\n"]/g, "_");
  const encoded = encodeURIComponent(safe);
  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
}

async function occurrenceAfterResourceMutation(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  result: MutateOccurrenceResourceResult
): Promise<Response> {
  if (result.status === "not_found") {
    return notFound();
  }

  if (result.status === "storage_unavailable") {
    return serverError("File storage is not configured.");
  }

  if (result.status === "invalid_serving_area") {
    return badRequest(
      "Choose a serving area that has staffing needs on this event.",
      "INVALID_SERVING_AREA"
    );
  }

  if (result.status === "resource_not_found") {
    return notFound();
  }

  if (result.status === "file_required") {
    return badRequest("A file is required.", "FILE_REQUIRED");
  }

  if (result.status === "file_too_large") {
    return badRequest("File must be 10 MB or smaller.", "FILE_TOO_LARGE");
  }

  const occurrence = await getGeneratedScheduleOccurrenceDetail(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!occurrence) {
    return notFound();
  }

  return json({
    success: true,
    data: { occurrence }
  });
}

async function postGeneratedOccurrenceResource(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return badRequest("Upload must be multipart form data.", "INVALID_FORM");
  }

  const fileEntry = formData.get("file");

  if (!isOccurrenceResourceUploadFile(fileEntry) || fileEntry.size < 1) {
    return badRequest("A file is required.", "FILE_REQUIRED");
  }

  const displayName = parseOptionalDisplayNameFromForm(formData.get("displayName"));
  const areaParsed = parseOptionalScheduleServingAreaIdFromForm(
    formData.get("scheduleServingAreaId")
  );

  if (typeof areaParsed === "string") {
    return badRequest(areaParsed);
  }

  try {
    const result = await createGeneratedOccurrenceResource(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      {
        file: fileEntry,
        displayName,
        scheduleServingAreaId: areaParsed
      }
    );

    if (result.status === "ok" && result.resourceId != null) {
      const scope = await scopeWithDisplayName(env, auth.admin!.organizationId, areaParsed);
      const label = displayName?.trim() || fileEntry.name || "file";

      await tryQueueScheduleContentChanges(
        env,
        auth.admin!.organizationId,
        generatedScheduleId,
        occurrenceId,
        [
          {
            scope,
            noteChanges: [],
            resourceChanges: [{ action: "added", resourceId: result.resourceId, label }]
          }
        ]
      );
    }

    return occurrenceAfterResourceMutation(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      result
    );
  } catch (error) {
    console.error("Failed to upload occurrence resource", error);
    return serverError("Unable to upload resource.");
  }
}

async function patchGeneratedOccurrenceResource(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number,
  resourceId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  const validation = validateOccurrenceResourceMetadataBody(body);

  if (typeof validation === "string") {
    return badRequest(validation);
  }

  try {
    const priorResource = await loadOccurrenceResourceSnapshot(
      env,
      auth.admin!.organizationId,
      occurrenceId,
      resourceId
    );

    const result = await updateGeneratedOccurrenceResource(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      resourceId,
      validation
    );

    if (result.status === "ok" && priorResource) {
      const priorLabel = resourceDisplayLabel(priorResource);
      const newLabel =
        validation.displayName?.trim() || priorResource.originalFilename;
      const newScope = await scopeWithDisplayName(
        env,
        auth.admin!.organizationId,
        validation.scheduleServingAreaId
      );
      const scopeChanges: ScheduleContentScopeChange[] = [];

      if (
        priorResource.scheduleServingAreaId !== validation.scheduleServingAreaId
      ) {
        const oldScope = await scopeWithDisplayName(
          env,
          auth.admin!.organizationId,
          priorResource.scheduleServingAreaId
        );

        scopeChanges.push(
          {
            scope: oldScope,
            noteChanges: [],
            resourceChanges: [{ action: "removed", label: priorLabel }]
          },
          {
            scope: newScope,
            noteChanges: [],
            resourceChanges: [
              { action: "added", resourceId: priorResource.id, label: newLabel }
            ]
          }
        );
      } else {
        scopeChanges.push({
          scope: newScope,
          noteChanges: [],
          resourceChanges: [
            {
              action: "updated",
              resourceId: priorResource.id,
              label: newLabel
            }
          ]
        });
      }

      await tryQueueScheduleContentChanges(
        env,
        auth.admin!.organizationId,
        generatedScheduleId,
        occurrenceId,
        scopeChanges
      );
    }

    return occurrenceAfterResourceMutation(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      result
    );
  } catch (error) {
    console.error("Failed to update occurrence resource", error);
    return serverError("Unable to update resource.");
  }
}

async function deleteGeneratedOccurrenceResourceRoute(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number,
  resourceId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  try {
    const priorResource = await loadOccurrenceResourceSnapshot(
      env,
      auth.admin!.organizationId,
      occurrenceId,
      resourceId
    );

    const result = await deleteGeneratedOccurrenceResource(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      resourceId
    );

    if (result.status === "ok" && priorResource) {
      const scope = await scopeWithDisplayName(
        env,
        auth.admin!.organizationId,
        priorResource.scheduleServingAreaId
      );

      await tryQueueScheduleContentChanges(
        env,
        auth.admin!.organizationId,
        generatedScheduleId,
        occurrenceId,
        [
          {
            scope,
            noteChanges: [],
            resourceChanges: [
              {
                action: "removed",
                label: resourceDisplayLabel(priorResource)
              }
            ]
          }
        ]
      );
    }

    return occurrenceAfterResourceMutation(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      result
    );
  } catch (error) {
    console.error("Failed to delete occurrence resource", error);
    return serverError("Unable to delete resource.");
  }
}

async function getGeneratedOccurrenceResourceDownloadRoute(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number,
  resourceId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const result = await getGeneratedOccurrenceResourceDownload(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      resourceId
    );

    if (result.status === "not_found" || result.status === "resource_not_found") {
      return notFound();
    }

    if (result.status === "storage_unavailable") {
      return serverError("File storage is not configured.");
    }

    const downloadName = result.displayName?.trim() || result.originalFilename;

    return new Response(result.object.body, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": contentDispositionAttachment(downloadName),
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error("Failed to download occurrence resource", error);
    return serverError("Unable to download resource.");
  }
}

async function getGeneratedOccurrence(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const occurrence = await getGeneratedScheduleOccurrenceDetail(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId
    );

    if (!occurrence) {
      return notFound();
    }

    return json({
      success: true,
      data: { occurrence }
    });
  } catch (error) {
    console.error("Failed to load generated schedule occurrence", error);
    return serverError("Unable to load event.");
  }
}

async function patchGeneratedOccurrence(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const parsed = validateUpdateOccurrenceStaffingBody(body);

  if (!parsed.ok) {
    return badRequest(parsed.message);
  }

  try {
    const result = await replaceGeneratedScheduleOccurrenceStaffing(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      parsed.value
    );

    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return notFound();
      }

      if (result.code === "INVALID_SERVING_AREA") {
        return badRequest("Each serving area must be connected to the schedule template.");
      }

      if (result.code === "INVALID_REQUIREMENT_ID") {
        return badRequest("One or more staffing rows could not be found for this event.");
      }

      if (result.code === "NEEDED_BELOW_ASSIGNED") {
        return badRequest("Needed count cannot be less than the number already assigned.");
      }

      return badRequest("Unable to update staffing.");
    }

    return json({
      success: true,
      data: { occurrence: result.occurrence }
    });
  } catch (error) {
    console.error("Failed to update generated schedule occurrence", error);
    return serverError("Unable to update event staffing.");
  }
}

async function getEligibleVolunteers(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number,
  requirementId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const volunteers = await listEligibleVolunteersForRequirement(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      requirementId
    );

    if (volunteers === null) {
      return notFound();
    }

    return json({
      success: true,
      data: { volunteers }
    });
  } catch (error) {
    console.error("Failed to list eligible volunteers", error);
    return serverError("Unable to load eligible volunteers.");
  }
}

async function postOccurrenceAssignment(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  if (!body || typeof body !== "object") {
    return badRequest("Request body is required.");
  }

  const record = body as Record<string, unknown>;
  const requirementId = Number(record.requirementId);
  const submissionId = Number(record.submissionId);

  if (!Number.isInteger(requirementId) || requirementId < 1) {
    return badRequest("Staffing need is required.");
  }

  if (!Number.isInteger(submissionId) || submissionId < 1) {
    return badRequest("Volunteer is required.");
  }

  try {
    const priorAssignments = await listPriorScheduleAssignmentsForSubmission(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      submissionId
    );

    const result = await createOccurrenceAssignment(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      requirementId,
      submissionId
    );

    if (!result.ok) {
      if (result.code === "NOT_FOUND") {
        return notFound();
      }

      if (result.code === "FULL") {
        return badRequest("This serving area is already covered for this event.");
      }

      if (result.code === "DUPLICATE") {
        return badRequest("That volunteer is already assigned to this serving area.");
      }

      if (result.code === "INELIGIBLE") {
        return badRequest(
          "That volunteer is not eligible. They must be approved / ready to schedule, not archived, and have this serving area as an interest."
        );
      }

      return badRequest("Unable to assign volunteer.");
    }

    try {
      await queueScheduleAssignmentAdded(
        env,
        auth.admin!.organizationId,
        generatedScheduleId,
        occurrenceId,
        requirementId,
        submissionId,
        priorAssignments
      );
    } catch (notifyError) {
      console.error("Failed to send assignment update notification", notifyError);
    }

    const occurrence = await getGeneratedScheduleOccurrenceDetail(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId
    );

    if (!occurrence) {
      return notFound();
    }

    return json(
      {
        success: true,
        data: { occurrence }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create occurrence assignment", error);
    return serverError("Unable to assign volunteer.");
  }
}

async function deleteOccurrenceAssignmentRoute(
  request: Request,
  env: Env,
  generatedScheduleId: number,
  occurrenceId: number,
  assignmentId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  const archivedBlock = await rejectIfGeneratedScheduleArchived(
    env,
    auth.admin!.organizationId,
    generatedScheduleId
  );

  if (archivedBlock) {
    return archivedBlock;
  }

  try {
    const removalSnapshot = await loadAssignmentRemovalSnapshot(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      assignmentId
    );

    const result = await deleteOccurrenceAssignment(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId,
      assignmentId
    );

    if (!result.ok) {
      return notFound();
    }

    if (removalSnapshot) {
      try {
        await queueScheduleAssignmentRemoved(
          env,
          auth.admin!.organizationId,
          generatedScheduleId,
          removalSnapshot
        );
      } catch (notifyError) {
        console.error("Failed to send assignment removal notification", notifyError);
      }
    }

    const occurrence = await getGeneratedScheduleOccurrenceDetail(
      env,
      auth.admin!.organizationId,
      generatedScheduleId,
      occurrenceId
    );

    if (!occurrence) {
      return notFound();
    }

    return json({
      success: true,
      data: { occurrence }
    });
  } catch (error) {
    console.error("Failed to delete occurrence assignment", error);
    return serverError("Unable to remove assignment.");
  }
}
