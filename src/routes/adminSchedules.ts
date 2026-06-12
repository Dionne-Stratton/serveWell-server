import { requireAdmin } from "../auth/adminGuard";
import {
  createAdminSchedule,
  deleteAdminSchedule,
  getAdminScheduleDetail,
  listAdminSchedules,
  listScheduleServingAreaCatalog,
  replaceAdminScheduleRhythms,
  replaceAdminScheduleServingAreas,
  updateAdminScheduleName
} from "../db/adminSchedules";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";
import {
  validateCreateScheduleBody,
  validateScheduleNamePatch,
  validateScheduleRhythmsUpdate,
  validateScheduleServingAreasUpdate
} from "../validation/schedules";

export async function tryAdminSchedulesRoute(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  if (pathname === "/api/admin/schedules/serving-area-options") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return getServingAreaOptions(request, env);
  }

  const subResourceMatch = pathname.match(/^\/api\/admin\/schedules\/(\d+)\/(serving-areas|rhythms)$/);

  if (subResourceMatch) {
    const scheduleId = Number(subResourceMatch[1]);
    const resource = subResourceMatch[2];

    if (!Number.isInteger(scheduleId) || scheduleId < 1) {
      return notFound();
    }

    if (resource === "serving-areas") {
      if (request.method !== "PUT") {
        return methodNotAllowed();
      }

      return putScheduleServingAreas(request, env, scheduleId);
    }

    if (request.method !== "PUT") {
      return methodNotAllowed();
    }

    return putScheduleRhythms(request, env, scheduleId);
  }

  const scheduleMatch = pathname.match(/^\/api\/admin\/schedules\/(\d+)$/);

  if (scheduleMatch) {
    const scheduleId = Number(scheduleMatch[1]);

    if (!Number.isInteger(scheduleId) || scheduleId < 1) {
      return notFound();
    }

    if (request.method === "GET") {
      return getScheduleDetail(request, env, scheduleId);
    }

    if (request.method === "PATCH") {
      return patchSchedule(request, env, scheduleId);
    }

    if (request.method === "DELETE") {
      return deleteSchedule(request, env, scheduleId);
    }

    return methodNotAllowed();
  }

  if (pathname === "/api/admin/schedules") {
    if (request.method === "GET") {
      return listSchedules(request, env);
    }

    if (request.method === "POST") {
      return postSchedule(request, env);
    }

    return methodNotAllowed();
  }

  return null;
}

async function listSchedules(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const schedules = await listAdminSchedules(env, auth.admin!.organizationId);

    return json({
      success: true,
      data: { schedules }
    });
  } catch (error) {
    console.error("Failed to list schedules", error);
    return serverError("Unable to load schedules.");
  }
}

async function getServingAreaOptions(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const forms = await listScheduleServingAreaCatalog(env, auth.admin!.organizationId);

    return json({
      success: true,
      data: { forms }
    });
  } catch (error) {
    console.error("Failed to load schedule serving area options", error);
    return serverError("Unable to load serving areas.");
  }
}

async function getScheduleDetail(
  request: Request,
  env: Env,
  scheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const detail = await getAdminScheduleDetail(env, auth.admin!.organizationId, scheduleId);

    if (!detail) {
      return notFound();
    }

    return json({
      success: true,
      data: detail
    });
  } catch (error) {
    console.error("Failed to load schedule", error);
    return serverError("Unable to load schedule.");
  }
}

async function postSchedule(request: Request, env: Env): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  const validation = validateCreateScheduleBody(body);

  if (!validation.input) {
    return badRequest(validation.error ?? "Invalid schedule.");
  }

  try {
    const created = await createAdminSchedule(env, auth.admin!.organizationId, validation.input);

    if (!created) {
      return badRequest("One or more serving areas could not be connected.");
    }

    return json(
      {
        success: true,
        data: created
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create schedule", error);
    return serverError("Unable to save schedule.");
  }
}

async function patchSchedule(
  request: Request,
  env: Env,
  scheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  const validation = validateScheduleNamePatch(body);

  if (!validation.name) {
    return badRequest(validation.error ?? "Invalid schedule name.");
  }

  try {
    const updated = await updateAdminScheduleName(
      env,
      auth.admin!.organizationId,
      scheduleId,
      validation.name
    );

    if (!updated) {
      return notFound();
    }

    return json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error("Failed to update schedule name", error);
    return serverError("Unable to save schedule.");
  }
}

async function putScheduleServingAreas(
  request: Request,
  env: Env,
  scheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  const validation = validateScheduleServingAreasUpdate(body);

  if (!validation.servingAreas) {
    return badRequest(validation.error ?? "Invalid serving areas.");
  }

  try {
    const result = await replaceAdminScheduleServingAreas(
      env,
      auth.admin!.organizationId,
      scheduleId,
      validation.servingAreas
    );

    if (result.status === "not_found") {
      return notFound();
    }

    if (result.status === "invalid_areas") {
      return badRequest("One or more serving areas could not be connected.");
    }

    if (result.status === "in_use") {
      const names = result.displayNames.join(", ");
      return badRequest(
        `Cannot remove serving area${result.displayNames.length === 1 ? "" : "s"} used in staffing: ${names}.`,
        "SERVING_AREA_IN_USE"
      );
    }

    return json({
      success: true,
      data: result.detail
    });
  } catch (error) {
    console.error("Failed to update schedule serving areas", error);
    return serverError("Unable to save serving areas.");
  }
}

async function putScheduleRhythms(
  request: Request,
  env: Env,
  scheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  try {
    const detail = await getAdminScheduleDetail(env, auth.admin!.organizationId, scheduleId);

    if (!detail) {
      return notFound();
    }

    const allowedIds = new Set(detail.servingAreas.map((row) => row.id));
    const validation = validateScheduleRhythmsUpdate(body, allowedIds);

    if (!validation.rhythms) {
      return badRequest(validation.error ?? "Invalid rhythms.");
    }

    const updated = await replaceAdminScheduleRhythms(
      env,
      auth.admin!.organizationId,
      scheduleId,
      validation.rhythms
    );

    if (!updated) {
      return notFound();
    }

    return json({
      success: true,
      data: updated
    });
  } catch (error) {
    console.error("Failed to update schedule rhythms", error);
    return serverError("Unable to save service times.");
  }
}

async function deleteSchedule(
  request: Request,
  env: Env,
  scheduleId: number
): Promise<Response> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth.response;
  }

  try {
    const deleted = await deleteAdminSchedule(env, auth.admin!.organizationId, scheduleId);

    if (!deleted) {
      return notFound();
    }

    return json({
      success: true,
      data: { id: scheduleId }
    });
  } catch (error) {
    console.error("Failed to delete schedule", error);
    return serverError("Unable to delete schedule.");
  }
}
