import { requireAdmin } from "../auth/adminGuard";
import { getPlanningCenterIntegration } from "../db/planningCenterIntegrations";
import { listPlanningCenterImportTabNames } from "../db/planningCenterImportSubmissions";
import {
  buildPlanningCenterImportPreview,
  executePlanningCenterImport,
  listPlanningCenterPeopleTabs,
  PlanningCenterImportError,
  searchPlanningCenterPeople
} from "../integrations/planningCenterImport";
import { badRequest, conflict, json, methodNotAllowed, serverError } from "../http/responses";
import type { Env } from "../types";

export async function tryPlanningCenterImportRoute(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  if (pathname === "/api/admin/integrations/planning-center/people") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return getPeopleSearch(request, env);
  }

  if (pathname === "/api/admin/integrations/planning-center/tabs") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return getPeopleTabs(request, env);
  }

  if (pathname === "/api/admin/integrations/planning-center/import-sources") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return getImportSources(request, env);
  }

  if (pathname === "/api/admin/integrations/planning-center/import/preview") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return postImportPreview(request, env);
  }

  if (pathname === "/api/admin/integrations/planning-center/import") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return postImport(request, env);
  }

  return null;
}

async function getPeopleSearch(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const connected = await assertIntegrationConnected(env, auth.admin!.organizationId);

    if (connected) {
      return connected;
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? "";

    const people = await searchPlanningCenterPeople(env, auth.admin!.organizationId, search);

    return json({
      success: true,
      data: { people }
    });
  } catch (error) {
    return handleImportError(error, "Unable to search Planning Center people.");
  }
}

async function getPeopleTabs(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const connected = await assertIntegrationConnected(env, auth.admin!.organizationId);

    if (connected) {
      return connected;
    }

    const tabs = await listPlanningCenterPeopleTabs(env, auth.admin!.organizationId);

    return json({
      success: true,
      data: { tabs }
    });
  } catch (error) {
    return handleImportError(error, "Unable to load Planning Center tabs.");
  }
}

async function getImportSources(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const tabNames = await listPlanningCenterImportTabNames(env, auth.admin!.organizationId);

    return json({
      success: true,
      data: { planningCenterImportTabNames: tabNames }
    });
  } catch (error) {
    console.error("Failed to list Planning Center import sources", error);
    return serverError("Unable to load import sources.");
  }
}

async function postImportPreview(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const connected = await assertIntegrationConnected(env, auth.admin!.organizationId);

    if (connected) {
      return connected;
    }

    const body = await readJsonBody(request);
    const parsed = parseImportBody(body);

    if (!parsed.ok) {
      return badRequest(parsed.message, parsed.code);
    }

    const preview = await buildPlanningCenterImportPreview(env, auth.admin!.organizationId, {
      personId: parsed.value.personId,
      tabId: parsed.value.tabId
    });

    return json({
      success: true,
      data: { preview }
    });
  } catch (error) {
    return handleImportError(error, "Unable to preview Planning Center import.");
  }
}

async function postImport(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const connected = await assertIntegrationConnected(env, auth.admin!.organizationId);

    if (connected) {
      return connected;
    }

    const body = await readJsonBody(request);
    const parsed = parseImportBody(body);

    if (!parsed.ok) {
      return badRequest(parsed.message, parsed.code);
    }

    const result = await executePlanningCenterImport(
      env,
      auth.admin!.organizationId,
      auth.admin!.id,
      {
        personId: parsed.value.personId,
        tabId: parsed.value.tabId
      }
    );

    return json(
      {
        success: true,
        data: {
          submissionId: result.submissionId
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return handleImportError(error, "Unable to import from Planning Center.");
  }
}

async function assertIntegrationConnected(
  env: Env,
  organizationId: number
): Promise<Response | null> {
  const integration = await getPlanningCenterIntegration(env, organizationId);

  if (integration?.status !== "connected") {
    return badRequest(
      "Connect Planning Center before importing people.",
      "INTEGRATION_NOT_CONNECTED"
    );
  }

  return null;
}

function parseImportBody(
  body: unknown
):
  | { ok: true; value: { personId: string; tabId: string } }
  | { ok: false; message: string; code: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body must be a JSON object.", code: "INVALID_JSON" };
  }

  const record = body as Record<string, unknown>;
  const personId = typeof record.personId === "string" ? record.personId.trim() : "";
  const tabId = typeof record.tabId === "string" ? record.tabId.trim() : "";

  if (!personId) {
    return { ok: false, message: "personId is required.", code: "VALIDATION_ERROR" };
  }

  if (!tabId) {
    return { ok: false, message: "tabId is required.", code: "VALIDATION_ERROR" };
  }

  return {
    ok: true,
    value: {
      personId,
      tabId
    }
  };
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new PlanningCenterImportError("Request body must be valid JSON.", "INVALID_JSON", 400);
  }
}

function handleImportError(error: unknown, fallbackMessage: string): Response {
  if (error instanceof PlanningCenterImportError) {
    if (error.code === "ALREADY_IMPORTED" && error.submissionId) {
      return conflict(error.message, error.code, { submissionId: error.submissionId });
    }

    return badRequest(error.message, error.code);
  }

  console.error(fallbackMessage, error);
  return serverError(fallbackMessage);
}
