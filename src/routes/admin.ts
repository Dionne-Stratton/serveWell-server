import { requireAdmin } from "../auth/adminGuard";
import { signAdminJwt } from "../auth/jwt";
import { verifyPassword } from "../auth/passwords";
import { findActiveAdminByEmail } from "../db/adminUsers";
import {
  findActiveOrganizationById,
  mapAdminSessionOrganization,
  mapPublicOrganization
} from "../db/organizations";
import {
  completePasswordReset,
  requestPasswordResetForEmail,
  sendPasswordResetForAdmin
} from "../auth/passwordReset";
import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import {
  createAdminVolunteerForm,
  getAdminFormById,
  listAdminForms,
  mapAdminForm,
  updateAdminForm,
  validateCreateAdminFormInput,
  validateUpdateAdminFormInput
} from "../db/adminForms";
import {
  buildAdminFormDetailResponse,
  tryAdminFormManagementRoute
} from "./adminFormManagement";
import {
  deleteAdminSubmission,
  getAdminSubmissionDetail,
  listAdminSubmissions,
  updateAdminSubmission
} from "../db/adminSubmissions";
import {
  createAdminNote,
  deleteAdminNote,
  validateAdminNoteText
} from "../db/adminNotes";
import { badRequest, json, methodNotAllowed, notFound, serverError, unauthorized } from "../http/responses";
import { ensurePlanningCenterTabForForm } from "../integrations/planningCenterFormTabs";
import {
  pushVolunteerSubmissionToPlanningCenter,
  PushVolunteerError
} from "../integrations/planningCenterVolunteerPush";
import type { Env } from "../types";
import { isOneOf, submissionStatuses } from "../validation/enums";

export async function adminRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/admin/login") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return login(request, env);
  }

  if (url.pathname === "/api/admin/me") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return me(request, env);
  }

  if (url.pathname === "/api/admin/request-password-reset") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return requestPasswordResetFromProfile(request, env);
  }

  if (url.pathname === "/api/admin/submissions") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return submissions(request, env);
  }

  if (url.pathname === "/api/admin/forms") {
    if (request.method === "GET") {
      return listForms(request, env);
    }

    if (request.method === "POST") {
      return postForm(request, env);
    }

    return methodNotAllowed();
  }

  const formManagementResponse = await tryAdminFormManagementRoute(
    request,
    env,
    url.pathname
  );

  if (formManagementResponse) {
    return formManagementResponse;
  }

  const adminFormMatch = url.pathname.match(/^\/api\/admin\/forms\/(\d+)$/);

  if (adminFormMatch) {
    const formId = Number(adminFormMatch[1]);

    if (request.method === "GET") {
      return getForm(request, env, formId);
    }

    if (request.method === "PATCH") {
      return patchForm(request, env, formId);
    }

    return methodNotAllowed();
  }

  const planningCenterPushMatch = url.pathname.match(
    /^\/api\/admin\/submissions\/(\d+)\/planning-center$/
  );

  if (planningCenterPushMatch) {
    const submissionId = Number(planningCenterPushMatch[1]);

    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return pushSubmissionToPlanningCenter(request, env, submissionId);
  }

  const submissionNotesMatch = url.pathname.match(
    /^\/api\/admin\/submissions\/(\d+)\/notes$/
  );

  if (submissionNotesMatch) {
    const submissionId = Number(submissionNotesMatch[1]);

    if (request.method === "POST") {
      return postSubmissionNote(request, env, submissionId);
    }

    return methodNotAllowed();
  }

  const adminNoteMatch = url.pathname.match(/^\/api\/admin\/notes\/(\d+)$/);

  if (adminNoteMatch) {
    const noteId = Number(adminNoteMatch[1]);

    if (request.method === "DELETE") {
      return deleteNote(request, env, noteId);
    }

    return methodNotAllowed();
  }

  const submissionDetailMatch = url.pathname.match(/^\/api\/admin\/submissions\/(\d+)$/);

  if (submissionDetailMatch) {
    const submissionId = Number(submissionDetailMatch[1]);

    if (request.method === "GET") {
      return submissionDetail(request, env, submissionId);
    }

    if (request.method === "PATCH") {
      return patchSubmission(request, env, submissionId);
    }

    if (request.method === "DELETE") {
      return deleteSubmission(request, env, submissionId);
    }

    return methodNotAllowed();
  }

  return notFound();
}

async function login(request: Request, env: Env): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const email = normalizeRequiredString(body.email);
  const password = normalizeRequiredString(body.password);

  if (!email || !password) {
    return badRequest("Email and password are required.");
  }

  try {
    const admin = await findActiveAdminByEmail(env, email);

    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      return json(
        {
          success: false,
          error: {
            message: "Invalid email or password.",
            code: "INVALID_LOGIN"
          }
        },
        { status: 401 }
      );
    }

    const { passwordHash: _passwordHash, ...safeAdmin } = admin;
    const organization = await findActiveOrganizationById(env, safeAdmin.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    const token = await signAdminJwt(safeAdmin, env);

    return json({
      success: true,
      data: {
        token,
        admin: safeAdmin,
        organization: mapPublicOrganization(organization)
      }
    });
  } catch (error) {
    console.error("Failed admin login", error);
    return serverError("Unable to log in.");
  }
}

async function me(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    return json({
      success: true,
      data: {
        admin: auth.admin,
        organization: mapAdminSessionOrganization(organization)
      }
    });
  } catch (error) {
    console.error("Failed admin me lookup", error);
    return serverError("Unable to load admin profile.");
  }
}

async function requestPasswordResetFromProfile(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    await sendPasswordResetForAdmin(
      env,
      auth.admin!.id,
      auth.admin!.email,
      auth.admin!.displayName
    );

    return json({
      success: true,
      data: {
        message: "Email sent."
      }
    });
  } catch (error) {
    console.error("Failed profile password reset request", error);
    return serverError("Unable to send password reset email.");
  }
}

async function submissions(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const url = new URL(request.url);
    const filters = {
      ...parseSubmissionFilters(url.searchParams),
      organizationId: auth.admin!.organizationId
    };
    const submissions = await listAdminSubmissions(env, filters);

    return json({
      success: true,
      data: {
        submissions
      }
    });
  } catch (error) {
    console.error("Failed admin submissions lookup", error);
    return serverError("Unable to load submissions.");
  }
}

async function listForms(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const forms = await listAdminForms(env, auth.admin!.organizationId);

    return json({
      success: true,
      data: {
        forms: forms.map(mapAdminForm)
      }
    });
  } catch (error) {
    console.error("Failed admin forms lookup", error);
    return serverError("Unable to load forms.");
  }
}

async function postForm(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    if (organization.slug === DEMO_ORGANIZATION_SLUG) {
      return badRequest(
        "The demo organization cannot create forms.",
        "DEMO_FORM_READ_ONLY"
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON.", "INVALID_JSON");
    }

    if (!isRecord(body)) {
      return badRequest("Request body must be a JSON object.");
    }

    const validation = validateCreateAdminFormInput(body);

    if (!validation.ok) {
      return badRequest(validation.message);
    }

    const created = await createAdminVolunteerForm(
      env,
      auth.admin!.organizationId,
      validation.value
    );

    if (created === "SLUG_IN_USE") {
      return badRequest("That URL slug is already used on another form.", "SLUG_IN_USE");
    }

    const planningCenterTab = await ensurePlanningCenterTabForForm(
      env,
      auth.admin!.organizationId,
      created.id,
      created.name
    );

    const responseData: {
      form: ReturnType<typeof mapAdminForm>;
      planningCenter?: { tabCreated: boolean; tabName: string };
    } = { form: mapAdminForm(created) };

    if (planningCenterTab?.setup.status === "ready") {
      responseData.planningCenter = {
        tabCreated: true,
        tabName: planningCenterTab.tabName
      };
    }

    return json(
      {
        success: true,
        data: responseData
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed admin form create", error);
    return serverError("Unable to create form.");
  }
}

async function getForm(request: Request, env: Env, formId: number): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    return buildAdminFormDetailResponse(env, formId, auth.admin!.organizationId);
  } catch (error) {
    console.error("Failed admin form lookup", error);
    return serverError("Unable to load form.");
  }
}

async function patchForm(request: Request, env: Env, formId: number): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    if (organization.slug === DEMO_ORGANIZATION_SLUG) {
      return badRequest(
        "The demo organization form cannot be edited.",
        "DEMO_FORM_READ_ONLY"
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON.", "INVALID_JSON");
    }

    if (!isRecord(body)) {
      return badRequest("Request body must be a JSON object.");
    }

    const validation = validateUpdateAdminFormInput(body);

    if (!validation.ok) {
      return badRequest(validation.message);
    }

    const updated = await updateAdminForm(
      env,
      formId,
      auth.admin!.organizationId,
      validation.value
    );

    if (!updated) {
      return notFound();
    }

    return json({
      success: true,
      data: {
        form: mapAdminForm(updated)
      }
    });
  } catch (error) {
    console.error("Failed admin form update", error);
    return serverError("Unable to update form.");
  }
}

async function submissionDetail(
  request: Request,
  env: Env,
  submissionId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const detail = await getAdminSubmissionDetail(
      env,
      submissionId,
      auth.admin!.organizationId
    );

    if (!detail) {
      return notFound();
    }

    return json({
      success: true,
      data: detail
    });
  } catch (error) {
    console.error("Failed admin submission detail lookup", error);
    return serverError("Unable to load submission.");
  }
}

async function patchSubmission(
  request: Request,
  env: Env,
  submissionId: number
): Promise<Response> {
  try {
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

    if (!isRecord(body)) {
      return badRequest("Request body must be a JSON object.");
    }

    const updateInput: { status?: string; isArchived?: boolean } = {};

    if (body.status !== undefined) {
      if (!isOneOf(body.status, submissionStatuses)) {
        return badRequest("Invalid submission status.");
      }

      updateInput.status = body.status;
    }

    if (body.isArchived !== undefined) {
      if (typeof body.isArchived !== "boolean") {
        return badRequest("isArchived must be a boolean.");
      }

      updateInput.isArchived = body.isArchived;
    }

    if (updateInput.status === undefined && updateInput.isArchived === undefined) {
      return badRequest("Provide at least one field to update.");
    }

    const updated = await updateAdminSubmission(
      env,
      submissionId,
      auth.admin!.organizationId,
      updateInput
    );

    if (!updated) {
      return notFound();
    }

    return json({
      success: true,
      data: {
        submission: updated
      }
    });
  } catch (error) {
    console.error("Failed admin submission update", error);
    return serverError("Unable to update submission.");
  }
}

async function postSubmissionNote(
  request: Request,
  env: Env,
  submissionId: number
): Promise<Response> {
  try {
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

    if (!isRecord(body)) {
      return badRequest("Request body must be a JSON object.");
    }

    const noteText = validateAdminNoteText(body.note);

    if (!noteText) {
      return badRequest("Note must be a non-empty string.", "INVALID_NOTE");
    }

    const note = await createAdminNote(
      env,
      submissionId,
      auth.admin!.organizationId,
      auth.admin!.id,
      noteText
    );

    if (!note) {
      return notFound();
    }

    return json(
      {
        success: true,
        data: {
          note
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create admin note", error);
    return serverError("Unable to add note.");
  }
}

async function deleteNote(request: Request, env: Env, noteId: number): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const deleted = await deleteAdminNote(env, noteId, auth.admin!.organizationId);

    if (!deleted) {
      return notFound();
    }

    return json({
      success: true,
      data: {
        deleted: true
      }
    });
  } catch (error) {
    console.error("Failed to delete admin note", error);
    return serverError("Unable to delete note.");
  }
}

async function pushSubmissionToPlanningCenter(
  request: Request,
  env: Env,
  submissionId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const result = await pushVolunteerSubmissionToPlanningCenter(
      env,
      auth.admin!.organizationId,
      submissionId
    );

    return json({
      success: true,
      data: {
        personId: result.personId,
        submission: {
          id: result.submissionId,
          status: result.status,
          planningCenterPersonId: result.planningCenterPersonId
        }
      }
    });
  } catch (error) {
    if (error instanceof PushVolunteerError) {
      return json(
        {
          success: false,
          error: {
            message: error.message,
            code: error.code
          }
        },
        { status: error.status }
      );
    }

    console.error("Failed to push submission to Planning Center", error);
    return serverError("Unable to add this volunteer to Planning Center.");
  }
}

async function deleteSubmission(
  request: Request,
  env: Env,
  submissionId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const deleted = await deleteAdminSubmission(
      env,
      submissionId,
      auth.admin!.organizationId
    );

    if (!deleted) {
      return notFound();
    }

    return json({
      success: true,
      data: {
        deleted: true
      }
    });
  } catch (error) {
    console.error("Failed admin submission delete", error);
    return serverError("Unable to delete submission.");
  }
}

function parseSubmissionFilters(searchParams: URLSearchParams) {
  const formId = normalizeOptionalPositiveInteger(searchParams.get("formId"));
  const status = normalizeOptionalString(searchParams.get("status"));
  const archived = normalizeOptionalBoolean(searchParams.get("archived"));
  const servingAreaId = normalizeOptionalPositiveInteger(searchParams.get("servingAreaId"));
  const formSectionId = normalizeOptionalPositiveInteger(searchParams.get("formSectionId"));
  const search = normalizeOptionalString(searchParams.get("search"));

  return {
    formId,
    status,
    archived,
    servingAreaId,
    formSectionId,
    search
  };
}

function normalizeOptionalString(value: string | null): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeOptionalBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;

  return undefined;
}

function normalizeOptionalPositiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
