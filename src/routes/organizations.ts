import {
  findActiveOrganizationBySlug,
  findActiveVolunteerFormBySlug,
  findDefaultActiveVolunteerForm
} from "../db/organizations";
import { buildPublicVolunteerFormPayload, defaultSubmissionSuccessMessage } from "../db/publicVolunteerForm";
import { createVolunteerSubmission } from "../db/volunteerSubmissions";
import { badRequest, json, methodNotAllowed, serverError } from "../http/responses";
import type { Env } from "../types";
import { validateVolunteerSubmission } from "../validation/volunteerSubmissions";

const volunteerFormPath =
  /^\/api\/organizations\/([^/]+)\/volunteer-form$/;
const formBySlugPath =
  /^\/api\/organizations\/([^/]+)\/forms\/([^/]+)$/;
const formSubmissionsPath =
  /^\/api\/organizations\/([^/]+)\/forms\/([^/]+)\/submissions$/;
const defaultVolunteerSubmissionsPath =
  /^\/api\/organizations\/([^/]+)\/volunteer-submissions$/;

export async function organizationRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const volunteerFormMatch = pathname.match(volunteerFormPath);

  if (volunteerFormMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return getVolunteerForm(request, env, volunteerFormMatch[1]);
  }

  const formBySlugMatch = pathname.match(formBySlugPath);

  if (formBySlugMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return getFormBySlug(env, formBySlugMatch[1], formBySlugMatch[2]);
  }

  const formSubmissionsMatch = pathname.match(formSubmissionsPath);

  if (formSubmissionsMatch) {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return createSubmission(env, formSubmissionsMatch[1], formSubmissionsMatch[2], request);
  }

  const defaultSubmissionsMatch = pathname.match(defaultVolunteerSubmissionsPath);

  if (defaultSubmissionsMatch) {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return createDefaultFormSubmission(env, defaultSubmissionsMatch[1], request);
  }

  return organizationNotFound();
}

async function getVolunteerForm(
  _request: Request,
  env: Env,
  organizationSlug: string
): Promise<Response> {
  try {
    const organization = await findActiveOrganizationBySlug(env, organizationSlug);

    if (!organization) {
      return organizationNotFound("Organization not found.");
    }

    const form = await findDefaultActiveVolunteerForm(env, organization.id);

    if (!form) {
      return organizationNotFound("No active volunteer form was found for this organization.");
    }

    const data = await buildPublicVolunteerFormPayload(env, organization, form);

    return json({ success: true, data });
  } catch (error) {
    console.error("Failed to load volunteer form", error);
    return serverError("Unable to load volunteer form.");
  }
}

async function getFormBySlug(
  env: Env,
  organizationSlug: string,
  formSlug: string
): Promise<Response> {
  try {
    const resolved = await resolveOrganizationForm(env, organizationSlug, formSlug);

    if (resolved.response) {
      return resolved.response;
    }

    const data = await buildPublicVolunteerFormPayload(
      env,
      resolved.organization!,
      resolved.form!
    );

    return json({ success: true, data });
  } catch (error) {
    console.error("Failed to load organization form", error);
    return serverError("Unable to load volunteer form.");
  }
}

async function createSubmission(
  env: Env,
  organizationSlug: string,
  formSlug: string,
  request: Request
): Promise<Response> {
  const resolved = await resolveOrganizationForm(env, organizationSlug, formSlug);

  if (resolved.response) {
    return resolved.response;
  }

  return createSubmissionForForm(env, request, resolved.organization!, resolved.form!);
}

async function createDefaultFormSubmission(
  env: Env,
  organizationSlug: string,
  request: Request
): Promise<Response> {
  const organization = await findActiveOrganizationBySlug(env, organizationSlug);

  if (!organization) {
    return organizationNotFound("Organization not found.");
  }

  const form = await findDefaultActiveVolunteerForm(env, organization.id);

  if (!form) {
    return organizationNotFound("No active volunteer form was found for this organization.");
  }

  return createSubmissionForForm(env, request, organization, form);
}

async function createSubmissionForForm(
  env: Env,
  request: Request,
  organization: NonNullable<Awaited<ReturnType<typeof findActiveOrganizationBySlug>>>,
  form: NonNullable<Awaited<ReturnType<typeof findActiveVolunteerFormBySlug>>>
): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  const scope = { organizationId: organization.id, formId: form.id };

  try {
    const validation = await validateVolunteerSubmission(env, body, scope);

    if (!validation.input) {
      return badRequest(validation.error ?? "Invalid volunteer submission.");
    }

    const submissionId = await createVolunteerSubmission(env, validation.input, scope);

    return json(
      {
        success: true,
        data: {
          submissionId,
          message: defaultSubmissionSuccessMessage(form)
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create volunteer submission", error);
    return serverError("Unable to submit volunteer interest.");
  }
}

async function resolveOrganizationForm(
  env: Env,
  organizationSlug: string,
  formSlug: string
): Promise<{
  organization?: NonNullable<Awaited<ReturnType<typeof findActiveOrganizationBySlug>>>;
  form?: NonNullable<Awaited<ReturnType<typeof findActiveVolunteerFormBySlug>>>;
  response?: Response;
}> {
  const organization = await findActiveOrganizationBySlug(env, organizationSlug);

  if (!organization) {
    return { response: organizationNotFound("Organization not found.") };
  }

  const resolvedFormSlug = formSlug === "default" ? null : formSlug;
  const form = resolvedFormSlug
    ? await findActiveVolunteerFormBySlug(env, organization.id, resolvedFormSlug)
    : await findDefaultActiveVolunteerForm(env, organization.id);

  if (!form) {
    return { response: organizationNotFound("Volunteer form not found.") };
  }

  return { organization, form };
}

function organizationNotFound(message = "Not found."): Response {
  return json(
    { success: false, error: { message, code: "NOT_FOUND" } },
    { status: 404 }
  );
}
