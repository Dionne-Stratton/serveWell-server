import { requireAdmin } from "../auth/adminGuard";
import {
  createAdminSchedule,
  listAdminSchedules,
  listScheduleServingAreaCatalog
} from "../db/adminSchedules";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";
import { validateCreateScheduleBody } from "../validation/schedules";

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
