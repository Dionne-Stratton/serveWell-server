import { requireAdmin } from "../auth/adminGuard";
import { requireOwner } from "../auth/adminOwnerGuard";
import { signAdminJwt } from "../auth/jwt";
import { verifyPassword } from "../auth/passwords";
import {
  findActiveAdminByOrganizationSlugAndEmail,
  updateAdminProfile
} from "../db/adminUsers";
import { permanentlyDeleteOrganization } from "../db/organizationDelete";
import {
  findActiveOrganizationById,
  mapAdminSessionOrganization,
  mapPublicOrganization,
  updateOrganizationProfile
} from "../db/organizations";
import { validateOrganizationProfileUpdate } from "../validation/organizationRegistration";
import {
  completePasswordReset,
  requestPasswordResetForEmail,
  sendPasswordResetForAdmin
} from "../auth/passwordReset";
import {
  getAdminNotificationPreferences,
  updateAdminNotificationPreferences
} from "../db/adminNotificationPreferences";
import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import { normalizeSubmissionStatus } from "../lib/submissionStatus";
import { notifyAdminsOfReadyToSchedule } from "../notifications/submissionNotifications";
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
  markVolunteerUpdateReviewed,
  touchSubmissionAdminActivity,
  updateAdminSubmission
} from "../db/adminSubmissions";
import { replaceVolunteerSubmissionContent } from "../db/volunteerSubmissions";
import { validateVolunteerSubmission } from "../validation/volunteerSubmissions";
import {
  createAdminNote,
  deleteAdminNote,
  validateAdminNoteText
} from "../db/adminNotes";
import { badRequest, json, methodNotAllowed, notFound, serverError, unauthorized } from "../http/responses";
import { tryAdminTeamRoute } from "./adminTeam";
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
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/admin/login") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return login(request, env);
  }

  if (url.pathname === "/api/admin/me") {
    if (request.method === "GET") {
      return me(request, env);
    }

    if (request.method === "PATCH") {
      return patchMe(request, env);
    }

    return methodNotAllowed();
  }

  if (url.pathname === "/api/admin/organization") {
    if (request.method === "PATCH") {
      return patchOrganization(request, env);
    }

    if (request.method === "DELETE") {
      return deleteOrganization(request, env);
    }

    return methodNotAllowed();
  }

  const teamResponse = await tryAdminTeamRoute(request, env, url.pathname);

  if (teamResponse) {
    return teamResponse;
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

  const markVolunteerUpdateReviewedMatch = url.pathname.match(
    /^\/api\/admin\/submissions\/(\d+)\/mark-volunteer-update-reviewed$/
  );

  if (markVolunteerUpdateReviewedMatch) {
    const submissionId = Number(markVolunteerUpdateReviewedMatch[1]);

    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return postMarkVolunteerUpdateReviewed(request, env, submissionId);
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
      return patchSubmission(ctx, request, env, submissionId);
    }

    if (request.method === "PUT") {
      return putSubmission(request, env, submissionId);
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

  const organizationSlug = normalizeRequiredString(body.organizationSlug);
  const email = normalizeRequiredString(body.email);
  const password = normalizeRequiredString(body.password);

  if (!organizationSlug || !email || !password) {
    return badRequest("Organization, email, and password are required.");
  }

  try {
    const admin = await findActiveAdminByOrganizationSlugAndEmail(
      env,
      organizationSlug,
      email
    );

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

    const notificationPreferences = await getAdminNotificationPreferences(
      env,
      auth.admin!.id,
      auth.admin!.organizationId
    );

    return json({
      success: true,
      data: {
        admin: auth.admin,
        organization: mapAdminSessionOrganization(organization),
        notificationPreferences: notificationPreferences ?? {
          newSubmissions: true,
          readyToSchedule: false,
          volunteerUpdated: true,
          adminJoined: auth.admin!.role === "owner"
        }
      }
    });
  } catch (error) {
    console.error("Failed admin me lookup", error);
    return serverError("Unable to load admin profile.");
  }
}

async function patchMe(request: Request, env: Env): Promise<Response> {
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

    const hasDisplayName = body.displayName !== undefined;
    const hasEmail = body.email !== undefined;
    const prefsBody = body.notificationPreferences;
    const hasPrefs = prefsBody !== undefined;

    if (!hasDisplayName && !hasEmail && !hasPrefs) {
      return badRequest(
        "Provide displayName, email, and/or notificationPreferences to update."
      );
    }

    let admin = auth.admin!;

    if (hasDisplayName || hasEmail) {
      const profileInput: { displayName?: string; email?: string } = {};

      if (hasDisplayName) {
        if (typeof body.displayName !== "string") {
          return badRequest("displayName must be a string.");
        }

        profileInput.displayName = body.displayName;
      }

      if (hasEmail) {
        if (typeof body.email !== "string") {
          return badRequest("email must be a string.");
        }

        profileInput.email = body.email;
      }

      const profileResult = await updateAdminProfile(
        env,
        admin.id,
        admin.organizationId,
        profileInput
      );

      if (!profileResult.ok) {
        return badRequest(profileResult.error, profileResult.code);
      }

      admin = profileResult.admin;
    }

    let notificationPreferences = await getAdminNotificationPreferences(
      env,
      admin.id,
      admin.organizationId
    );

    if (hasPrefs) {
      if (!isRecord(prefsBody)) {
        return badRequest("notificationPreferences must be a JSON object.");
      }

      const updateInput: {
        newSubmissions?: boolean;
        readyToSchedule?: boolean;
        volunteerUpdated?: boolean;
        adminJoined?: boolean;
      } = {};

      if (prefsBody.newSubmissions !== undefined) {
        if (typeof prefsBody.newSubmissions !== "boolean") {
          return badRequest("notificationPreferences.newSubmissions must be a boolean.");
        }

        updateInput.newSubmissions = prefsBody.newSubmissions;
      }

      if (prefsBody.readyToSchedule !== undefined) {
        if (typeof prefsBody.readyToSchedule !== "boolean") {
          return badRequest("notificationPreferences.readyToSchedule must be a boolean.");
        }

        updateInput.readyToSchedule = prefsBody.readyToSchedule;
      }

      if (prefsBody.volunteerUpdated !== undefined) {
        if (typeof prefsBody.volunteerUpdated !== "boolean") {
          return badRequest("notificationPreferences.volunteerUpdated must be a boolean.");
        }

        updateInput.volunteerUpdated = prefsBody.volunteerUpdated;
      }

      if (prefsBody.adminJoined !== undefined) {
        if (auth.admin!.role !== "owner") {
          return badRequest("Only the organization owner can change admin joined notifications.");
        }

        if (typeof prefsBody.adminJoined !== "boolean") {
          return badRequest("notificationPreferences.adminJoined must be a boolean.");
        }

        updateInput.adminJoined = prefsBody.adminJoined;
      }

      if (
        updateInput.newSubmissions === undefined &&
        updateInput.readyToSchedule === undefined &&
        updateInput.volunteerUpdated === undefined &&
        updateInput.adminJoined === undefined
      ) {
        return badRequest("Provide at least one notification preference to update.");
      }

      notificationPreferences = await updateAdminNotificationPreferences(
        env,
        admin.id,
        admin.organizationId,
        updateInput
      );

      if (!notificationPreferences) {
        return serverError("Unable to update notification preferences.");
      }
    }

    const organization = await findActiveOrganizationById(env, admin.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    return json({
      success: true,
      data: {
        admin,
        organization: mapAdminSessionOrganization(organization),
        notificationPreferences: notificationPreferences ?? {
          newSubmissions: true,
          readyToSchedule: false,
          volunteerUpdated: true,
          adminJoined: admin.role === "owner"
        }
      }
    });
  } catch (error) {
    console.error("Failed admin me patch", error);
    return serverError("Unable to update profile.");
  }
}

async function patchOrganization(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireOwner(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    if (organization.slug === DEMO_ORGANIZATION_SLUG) {
      return badRequest("The demo organization cannot be edited.");
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON.", "INVALID_JSON");
    }

    const validation = validateOrganizationProfileUpdate(body);

    if (!validation.ok) {
      return badRequest(validation.message, validation.code);
    }

    const updated = await updateOrganizationProfile(
      env,
      organization.id,
      validation.value
    );

    if (!updated.ok) {
      return badRequest(updated.error, updated.code);
    }

    const notificationPreferences = await getAdminNotificationPreferences(
      env,
      auth.admin!.id,
      auth.admin!.organizationId
    );

    return json({
      success: true,
      data: {
        admin: auth.admin,
        organization: mapAdminSessionOrganization(updated.organization),
        notificationPreferences: notificationPreferences ?? {
          newSubmissions: true,
          readyToSchedule: false,
          volunteerUpdated: true,
          adminJoined: auth.admin!.role === "owner"
        }
      }
    });
  } catch (error) {
    console.error("Failed organization profile update", error);
    return serverError("Unable to update organization.");
  }
}

async function deleteOrganization(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireOwner(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    if (organization.slug === DEMO_ORGANIZATION_SLUG) {
      return badRequest("The demo organization cannot be deleted.");
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON.", "INVALID_JSON");
    }

    const confirmSlug =
      typeof body === "object" && body !== null && "confirmSlug" in body
        ? normalizeRequiredString((body as { confirmSlug: unknown }).confirmSlug)
        : null;

    if (!confirmSlug) {
      return badRequest("confirmSlug is required.");
    }

    if (confirmSlug !== organization.slug) {
      return badRequest("Confirmation slug does not match this organization.");
    }

    const deleted = await permanentlyDeleteOrganization(env, organization.id);

    if (!deleted) {
      return serverError("Unable to delete this organization.");
    }

    return json({
      success: true,
      data: {
        deleted: true
      }
    });
  } catch (error) {
    console.error("Failed organization delete", error);
    return serverError("Unable to delete organization.");
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

async function postMarkVolunteerUpdateReviewed(
  request: Request,
  env: Env,
  submissionId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const marked = await markVolunteerUpdateReviewed(
      env,
      submissionId,
      auth.admin!.organizationId,
      auth.admin!.id
    );

    if (!marked) {
      return badRequest(
        "This submission does not have a volunteer update waiting for review.",
        "NO_VOLUNTEER_UPDATE_REVIEW_PENDING"
      );
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
    console.error("Failed to mark volunteer update reviewed", error);
    return serverError("Unable to mark volunteer update as reviewed.");
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

async function putSubmission(
  request: Request,
  env: Env,
  submissionId: number
): Promise<Response> {
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
      return badRequest("Volunteer submissions cannot be edited in the demo organization.");
    }

    const existing = await getAdminSubmissionDetail(
      env,
      submissionId,
      auth.admin!.organizationId
    );

    if (!existing) {
      return notFound();
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON.", "INVALID_JSON");
    }

    const validation = await validateVolunteerSubmission(env, body, {
      organizationId: auth.admin!.organizationId,
      formId: existing.submission.formId
    });

    if (validation.error || !validation.input) {
      return badRequest(validation.error ?? "Invalid submission payload.");
    }

    const replaced = await replaceVolunteerSubmissionContent(
      env,
      submissionId,
      auth.admin!.organizationId,
      existing.submission.formId,
      validation.input,
      auth.admin!.id
    );

    if (!replaced) {
      return notFound();
    }

    const detail = await getAdminSubmissionDetail(
      env,
      submissionId,
      auth.admin!.organizationId
    );

    if (!detail) {
      return serverError("Submission was updated but could not be reloaded.");
    }

    return json({
      success: true,
      data: detail
    });
  } catch (error) {
    console.error("Failed admin submission replace", error);
    return serverError("Unable to update submission.");
  }
}

async function patchSubmission(
  ctx: ExecutionContext,
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
      updateInput,
      auth.admin!.id
    );

    if (!updated) {
      return notFound();
    }

    const becameReadyToSchedule =
      updated.statusChanged === true &&
      updated.previousStatus !== undefined &&
      normalizeSubmissionStatus(updated.status) === "approved_ready_to_schedule" &&
      normalizeSubmissionStatus(updated.previousStatus) !== "approved_ready_to_schedule";

    if (becameReadyToSchedule) {
      const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

      if (organization) {
        ctx.waitUntil(
          notifyAdminsOfReadyToSchedule(
            env,
            {
              organizationId: organization.id,
              organizationSlug: organization.slug,
              organizationName: organization.name,
              submissionId
            },
            auth.admin!.id
          )
        );
      }
    }

    const { previousStatus: _previousStatus, statusChanged: _statusChanged, ...submission } =
      updated;

    return json({
      success: true,
      data: {
        submission
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

    await touchSubmissionAdminActivity(
      env,
      submissionId,
      auth.admin!.organizationId,
      auth.admin!.id
    );

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
      submissionId,
      auth.admin!.id
    );

    return json({
      success: true,
      data: {
        personId: result.personId,
        submission: {
          id: result.submissionId,
          status: result.status,
          planningCenterPersonId: result.planningCenterPersonId,
          planningCenterSyncedAt: result.planningCenterSyncedAt,
          planningCenterSyncedBy: result.planningCenterSyncedBy,
          editedSinceLastPlanningCenterSync: result.editedSinceLastPlanningCenterSync
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
