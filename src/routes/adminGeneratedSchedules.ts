import { requireAdmin } from "../auth/adminGuard";
import {
  createGeneratedScheduleFromTemplate,
  deleteGeneratedSchedule,
  getGeneratedScheduleDetail,
  getGeneratedScheduleOccurrenceDetail,
  listGeneratedSchedules,
  replaceGeneratedScheduleOccurrenceStaffing
} from "../db/adminGeneratedSchedules";
import {
  createOccurrenceAssignment,
  deleteOccurrenceAssignment,
  listEligibleVolunteersForRequirement
} from "../db/adminGeneratedOccurrenceAssignments";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";
import {
  validateCreateGeneratedScheduleBody,
  validateRangeForTemplateType
} from "../validation/generatedSchedules";
import { validateUpdateOccurrenceStaffingBody } from "../validation/generatedOccurrenceStaffing";
import type { ScheduleType } from "../validation/schedules";

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

    return json(
      {
        success: true,
        data: { generatedSchedule: created }
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
        return badRequest("This serving area is already fully staffed for this event.");
      }

      if (result.code === "DUPLICATE") {
        return badRequest("That volunteer is already assigned to this serving area.");
      }

      if (result.code === "INELIGIBLE") {
        return badRequest(
          "That volunteer is not eligible. They must be an active submission with this serving area as an interest."
        );
      }

      return badRequest("Unable to assign volunteer.");
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

  try {
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
