import { sha256Hex } from "../auth/passwordReset";
import { getAdminSubmissionDetail } from "../db/adminSubmissions";
import {
  findActiveOrganizationBySlug,
  findDefaultActiveVolunteerForm,
  findVolunteerFormById,
  findVolunteerFormBySlug
} from "../db/organizations";
import { buildPublicVolunteerFormPayload } from "../db/publicVolunteerForm";
import {
  consumeVolunteerSubmissionEditToken,
  findValidVolunteerEditTokenByHash
} from "../db/volunteerSubmissionEditTokens";
import { replaceVolunteerSubmissionByVolunteer } from "../db/volunteerSubmissions";
import { notifyAdminsOfVolunteerSelfUpdate } from "../notifications/volunteerUpdatedNotifications";
import {
  requestVolunteerSubmissionUpdateLink,
  VOLUNTEER_UPDATE_LINK_ACK
} from "../volunteer/requestSubmissionUpdateLink";
import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";
import { validateVolunteerSubmission } from "../validation/volunteerSubmissions";

const updateRequestDefaultPath =
  /^\/api\/organizations\/([^/]+)\/volunteer-submission-update-request$/;
const updateRequestFormPath =
  /^\/api\/organizations\/([^/]+)\/forms\/([^/]+)\/submission-update-request$/;

export async function tryPublicVolunteerSubmissionEditRoute(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  pathname: string
): Promise<Response | null> {
  if (pathname === "/api/public/volunteer-submission-edit") {
    if (request.method === "GET") {
      return getVolunteerSubmissionEditPreview(request, env);
    }

    if (request.method === "PUT") {
      return saveVolunteerSubmissionEdit(request, env, ctx);
    }

    return methodNotAllowed();
  }

  const defaultRequestMatch = pathname.match(updateRequestDefaultPath);

  if (defaultRequestMatch) {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return postDefaultFormUpdateRequest(ctx, env, defaultRequestMatch[1], request);
  }

  const formRequestMatch = pathname.match(updateRequestFormPath);

  if (formRequestMatch) {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return postFormUpdateRequest(ctx, env, formRequestMatch[1], formRequestMatch[2], request);
  }

  return null;
}

async function postDefaultFormUpdateRequest(
  ctx: ExecutionContext,
  env: Env,
  organizationSlug: string,
  request: Request
): Promise<Response> {
  const organization = await findActiveOrganizationBySlug(env, organizationSlug);

  if (!organization) {
    return organizationNotFound();
  }

  const form = await findDefaultActiveVolunteerForm(env, organization.id);

  if (!form) {
    return organizationNotFound();
  }

  return postUpdateRequestForForm(ctx, env, organization, form, request);
}

async function postFormUpdateRequest(
  ctx: ExecutionContext,
  env: Env,
  organizationSlug: string,
  formSlug: string,
  request: Request
): Promise<Response> {
  const organization = await findActiveOrganizationBySlug(env, organizationSlug);

  if (!organization) {
    return organizationNotFound();
  }

  const form = await findVolunteerFormBySlug(env, organization.id, formSlug);

  if (!form || !form.isActive) {
    return organizationNotFound();
  }

  return postUpdateRequestForForm(ctx, env, organization, form, request);
}

async function postUpdateRequestForForm(
  ctx: ExecutionContext,
  env: Env,
  organization: NonNullable<Awaited<ReturnType<typeof findActiveOrganizationBySlug>>>,
  form: NonNullable<Awaited<ReturnType<typeof findVolunteerFormBySlug>>>,
  request: Request
): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const email = normalizeRequiredString(body.email)?.toLowerCase();

  if (!email) {
    return badRequest("Email is required.");
  }

  const sendEmail = organization.slug !== DEMO_ORGANIZATION_SLUG;

  ctx.waitUntil(
    requestVolunteerSubmissionUpdateLink(env, {
      organizationSlug: organization.slug,
      organizationName: organization.name,
      formId: form.id,
      email,
      sendEmail
    })
  );

  return json({
    success: true,
    data: { message: VOLUNTEER_UPDATE_LINK_ACK }
  });
}

async function getVolunteerSubmissionEditPreview(
  request: Request,
  env: Env
): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token")?.trim();

  if (!token) {
    return badRequest("Edit token is required.");
  }

  try {
    const resolved = await resolveEditToken(env, token);

    if (!resolved) {
      return badRequest(
        "This update link is invalid or has expired.",
        "INVALID_EDIT_TOKEN"
      );
    }

    const organization = await findActiveOrganizationBySlug(env, resolved.organizationSlug);

    if (!organization) {
      return notFound();
    }

    const form = await findVolunteerFormById(env, organization.id, resolved.formId);

    if (!form?.isActive) {
      return notFound();
    }

    const [formPayload, detail] = await Promise.all([
      buildPublicVolunteerFormPayload(env, organization, form),
      getAdminSubmissionDetail(env, resolved.submissionId, resolved.organizationId)
    ]);

    if (!detail) {
      return badRequest("This update link is invalid or has expired.", "INVALID_EDIT_TOKEN");
    }

    return json({
      success: true,
      data: {
        organizationSlug: organization.slug,
        form: formPayload.form,
        sections: formPayload.sections,
        servingAreas: formPayload.servingAreas,
        submission: detail
      }
    });
  } catch (error) {
    console.error("Failed volunteer edit preview", error);
    return serverError("Unable to load submission for editing.");
  }
}

async function saveVolunteerSubmissionEdit(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const token = normalizeRequiredString(body.token);

  if (!token) {
    return badRequest("Edit token is required.");
  }

  try {
    const resolved = await resolveEditToken(env, token);

    if (!resolved) {
      return badRequest(
        "This update link is invalid or has expired.",
        "INVALID_EDIT_TOKEN"
      );
    }

    const organization = await findActiveOrganizationBySlug(env, resolved.organizationSlug);

    if (!organization) {
      return notFound();
    }

    const scope = {
      organizationId: resolved.organizationId,
      formId: resolved.formId
    };

    const validation = await validateVolunteerSubmission(env, body, scope, {
      excludeSubmissionId: resolved.submissionId
    });

    if (!validation.input) {
      return badRequest(validation.error ?? "Invalid volunteer submission.");
    }

    const saved = await replaceVolunteerSubmissionByVolunteer(
      env,
      resolved.submissionId,
      resolved.organizationId,
      resolved.formId,
      validation.input
    );

    if (!saved) {
      return badRequest("This submission could not be updated.", "INVALID_EDIT_TOKEN");
    }

    await consumeVolunteerSubmissionEditToken(env, resolved.tokenId);

    const volunteerName = `${validation.input.firstName} ${validation.input.lastName}`.trim();

    ctx.waitUntil(
      notifyAdminsOfVolunteerSelfUpdate(env, {
        organizationId: organization.id,
        organizationSlug: organization.slug,
        organizationName: organization.name,
        submissionId: resolved.submissionId,
        volunteerName
      })
    );

    return json({
      success: true,
      data: {
        message:
          "Your submission was updated. Someone from the church may follow up after reviewing your changes."
      }
    });
  } catch (error) {
    console.error("Failed volunteer self-edit save", error);
    return serverError("Unable to save your submission.");
  }
}

async function resolveEditToken(env: Env, plainToken: string) {
  const tokenHash = await sha256Hex(plainToken);
  const record = await findValidVolunteerEditTokenByHash(env, tokenHash);

  if (!record) {
    return null;
  }

  return {
    tokenId: record.id,
    submissionId: record.submissionId,
    organizationId: record.organizationId,
    organizationSlug: record.organizationSlug,
    formId: record.formId
  };
}

function organizationNotFound(): Response {
  return json(
    {
      success: false,
      error: { message: "Organization not found.", code: "NOT_FOUND" }
    },
    { status: 404 }
  );
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
