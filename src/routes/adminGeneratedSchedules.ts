import { requireAdmin } from "../auth/adminGuard";
import {
  createGeneratedScheduleFromTemplate,
  getGeneratedScheduleDetail,
  listGeneratedSchedules
} from "../db/adminGeneratedSchedules";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";
import {
  validateCreateGeneratedScheduleBody,
  validateRangeForTemplateType
} from "../validation/generatedSchedules";
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

  const detailMatch = pathname.match(/^\/api\/admin\/generated-schedules\/(\d+)$/);

  if (detailMatch) {
    const generatedScheduleId = Number(detailMatch[1]);

    if (!Number.isInteger(generatedScheduleId) || generatedScheduleId < 1) {
      return notFound();
    }

    if (request.method === "GET") {
      return getGenerated(request, env, generatedScheduleId);
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
