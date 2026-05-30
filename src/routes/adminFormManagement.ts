import { requireAdmin } from "../auth/adminGuard";
import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import {
  deleteAdminVolunteerForm,
  getAdminFormDetail,
  mapAdminFormDetailResponse
} from "../db/adminFormDetail";
import { getAdminFormById } from "../db/adminForms";
import {
  createAdminRequirement,
  deleteAdminRequirement,
  mapAdminRequirement,
  updateAdminRequirement,
  validateCreateRequirementInput,
  validateUpdateRequirementInput
} from "../db/adminRequirements";
import {
  createAdminServingArea,
  deleteAdminServingArea,
  getAdminServingAreaById,
  mapAdminServingArea,
  updateAdminServingArea,
  validateCreateAdminServingAreaInput,
  validateUpdateAdminServingAreaInput
} from "../db/adminServingAreas";
import {
  createFormSection,
  deleteFormSection,
  getFormSectionById,
  mapAdminSection,
  updateFormSection,
  validateSectionTitle
} from "../db/formSections";
import { findActiveOrganizationById } from "../db/organizations";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function tryAdminFormManagementRoute(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  const formSectionsMatch = pathname.match(/^\/api\/admin\/forms\/(\d+)\/sections$/);

  if (formSectionsMatch) {
    const formId = Number(formSectionsMatch[1]);

    if (request.method === "POST") {
      return postFormSection(request, env, formId);
    }

    return methodNotAllowed();
  }

  const formAreasMatch = pathname.match(/^\/api\/admin\/forms\/(\d+)\/serving-areas$/);

  if (formAreasMatch) {
    const formId = Number(formAreasMatch[1]);

    if (request.method === "POST") {
      return postServingArea(request, env, formId);
    }

    return methodNotAllowed();
  }

  const formMatch = pathname.match(/^\/api\/admin\/forms\/(\d+)$/);

  if (formMatch) {
    const formId = Number(formMatch[1]);

    if (request.method === "DELETE") {
      return deleteForm(request, env, formId);
    }

    return null;
  }

  const sectionMatch = pathname.match(/^\/api\/admin\/form-sections\/(\d+)$/);

  if (sectionMatch) {
    const sectionId = Number(sectionMatch[1]);

    if (request.method === "PATCH") {
      return patchFormSection(request, env, sectionId);
    }

    if (request.method === "DELETE") {
      return removeFormSection(request, env, sectionId);
    }

    return methodNotAllowed();
  }

  const servingAreaMatch = pathname.match(/^\/api\/admin\/serving-areas\/(\d+)$/);

  if (servingAreaMatch) {
    const servingAreaId = Number(servingAreaMatch[1]);

    if (request.method === "PATCH") {
      return patchServingArea(request, env, servingAreaId);
    }

    if (request.method === "DELETE") {
      return removeServingArea(request, env, servingAreaId);
    }

    return methodNotAllowed();
  }

  const areaRequirementsMatch = pathname.match(
    /^\/api\/admin\/serving-areas\/(\d+)\/requirements$/
  );

  if (areaRequirementsMatch) {
    const servingAreaId = Number(areaRequirementsMatch[1]);

    if (request.method === "POST") {
      return postRequirement(request, env, servingAreaId);
    }

    return methodNotAllowed();
  }

  const requirementMatch = pathname.match(/^\/api\/admin\/requirements\/(\d+)$/);

  if (requirementMatch) {
    const requirementId = Number(requirementMatch[1]);

    if (request.method === "PATCH") {
      return patchRequirement(request, env, requirementId);
    }

    if (request.method === "DELETE") {
      return removeRequirement(request, env, requirementId);
    }

    return methodNotAllowed();
  }

  return null;
}

async function demoEditBlock(env: Env, organizationId: number): Promise<Response | null> {
  const organization = await findActiveOrganizationById(env, organizationId);

  if (!organization) {
    return serverError("Admin organization is not available.");
  }

  if (organization.slug === DEMO_ORGANIZATION_SLUG) {
    return badRequest("Demo organization forms cannot be edited.", "DEMO_READ_ONLY");
  }

  return null;
}

async function deleteForm(request: Request, env: Env, formId: number): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
    }

    const deleted = await deleteAdminVolunteerForm(env, formId, auth.admin!.organizationId);

    if (!deleted) {
      return notFound();
    }

    return json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Failed admin form delete", error);
    return serverError("Unable to delete form.");
  }
}

async function postFormSection(
  request: Request,
  env: Env,
  formId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
    }

    const form = await getAdminFormById(env, formId, auth.admin!.organizationId);

    if (!form) {
      return notFound();
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

    const titleValidation = validateSectionTitle(body.title);

    if (!titleValidation.ok) {
      return badRequest(titleValidation.message);
    }

    const section = await createFormSection(
      env,
      auth.admin!.organizationId,
      formId,
      titleValidation.value,
      typeof body.sortOrder === "number" ? body.sortOrder : undefined
    );

    return json(
      {
        success: true,
        data: { section: mapAdminSection(section) }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed admin section create", error);
    return serverError("Unable to create section.");
  }
}

async function patchFormSection(
  request: Request,
  env: Env,
  sectionId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
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

    const input: { title?: string; sortOrder?: number } = {};

    if (body.title !== undefined) {
      const titleValidation = validateSectionTitle(body.title);

      if (!titleValidation.ok) {
        return badRequest(titleValidation.message);
      }

      input.title = titleValidation.value;
    }

    if (body.sortOrder !== undefined) {
      if (typeof body.sortOrder !== "number") {
        return badRequest("sortOrder must be a number.");
      }

      input.sortOrder = body.sortOrder;
    }

    const updated = await updateFormSection(env, sectionId, auth.admin!.organizationId, input);

    if (!updated) {
      return notFound();
    }

    return json({
      success: true,
      data: { section: mapAdminSection(updated) }
    });
  } catch (error) {
    console.error("Failed admin section update", error);
    return serverError("Unable to update section.");
  }
}

async function removeFormSection(
  request: Request,
  env: Env,
  sectionId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
    }

    try {
      const deleted = await deleteFormSection(env, sectionId, auth.admin!.organizationId);

      if (!deleted) {
        return notFound();
      }
    } catch (error) {
      if (error instanceof Error && error.message === "SECTION_HAS_AREAS") {
        return badRequest(
          "Remove or move serving areas before deleting this section.",
          "SECTION_HAS_AREAS"
        );
      }

      throw error;
    }

    return json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Failed admin section delete", error);
    return serverError("Unable to delete section.");
  }
}

async function postServingArea(
  request: Request,
  env: Env,
  formId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
    }

    const form = await getAdminFormById(env, formId, auth.admin!.organizationId);

    if (!form) {
      return notFound();
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

    const validation = validateCreateAdminServingAreaInput(body);

    if (!validation.ok) {
      return badRequest(validation.message);
    }

    const section = await getFormSectionById(
      env,
      validation.value.sectionId,
      auth.admin!.organizationId
    );

    if (!section || section.formId !== formId) {
      return badRequest("Invalid section for this form.");
    }

    const area = await createAdminServingArea(
      env,
      auth.admin!.organizationId,
      formId,
      validation.value
    );

    return json(
      {
        success: true,
        data: { servingArea: mapAdminServingArea(area) }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed admin serving area create", error);
    return serverError("Unable to create serving area.");
  }
}

async function patchServingArea(
  request: Request,
  env: Env,
  servingAreaId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
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

    const validation = validateUpdateAdminServingAreaInput(body);

    if (!validation.ok) {
      return badRequest(validation.message);
    }

    if (validation.value.sectionId !== undefined) {
      const area = await getAdminServingAreaById(env, servingAreaId, auth.admin!.organizationId);

      if (!area) {
        return notFound();
      }

      const section = await getFormSectionById(
        env,
        validation.value.sectionId,
        auth.admin!.organizationId
      );

      if (!section || section.formId !== area.formId) {
        return badRequest("Invalid section for this form.");
      }
    }

    const updated = await updateAdminServingArea(
      env,
      servingAreaId,
      auth.admin!.organizationId,
      validation.value
    );

    if (!updated) {
      return notFound();
    }

    return json({
      success: true,
      data: { servingArea: mapAdminServingArea(updated) }
    });
  } catch (error) {
    console.error("Failed admin serving area update", error);
    return serverError("Unable to update serving area.");
  }
}

async function removeServingArea(
  request: Request,
  env: Env,
  servingAreaId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
    }

    const deleted = await deleteAdminServingArea(
      env,
      servingAreaId,
      auth.admin!.organizationId
    );

    if (!deleted) {
      return notFound();
    }

    return json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Failed admin serving area delete", error);
    return serverError("Unable to delete serving area.");
  }
}

async function postRequirement(
  request: Request,
  env: Env,
  servingAreaId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
    }

    const area = await getAdminServingAreaById(env, servingAreaId, auth.admin!.organizationId);

    if (!area) {
      return notFound();
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

    const validation = validateCreateRequirementInput(body);

    if (!validation.ok) {
      return badRequest(validation.message);
    }

    const requirement = await createAdminRequirement(
      env,
      auth.admin!.organizationId,
      area.formId,
      servingAreaId,
      validation.value
    );

    return json(
      {
        success: true,
        data: { requirement: mapAdminRequirement(requirement) }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed admin requirement create", error);
    return serverError("Unable to create requirement.");
  }
}

async function patchRequirement(
  request: Request,
  env: Env,
  requirementId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
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

    const validation = validateUpdateRequirementInput(body);

    if (!validation.ok) {
      return badRequest(validation.message);
    }

    const updated = await updateAdminRequirement(
      env,
      requirementId,
      auth.admin!.organizationId,
      validation.value
    );

    if (!updated) {
      return notFound();
    }

    return json({
      success: true,
      data: { requirement: mapAdminRequirement(updated) }
    });
  } catch (error) {
    console.error("Failed admin requirement update", error);
    return serverError("Unable to update requirement.");
  }
}

async function removeRequirement(
  request: Request,
  env: Env,
  requirementId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const demoBlock = await demoEditBlock(env, auth.admin!.organizationId);

    if (demoBlock) {
      return demoBlock;
    }

    const deleted = await deleteAdminRequirement(
      env,
      requirementId,
      auth.admin!.organizationId
    );

    if (!deleted) {
      return notFound();
    }

    return json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("Failed admin requirement delete", error);
    return serverError("Unable to delete requirement.");
  }
}

export async function buildAdminFormDetailResponse(
  env: Env,
  formId: number,
  organizationId: number
): Promise<Response> {
  const detail = await getAdminFormDetail(env, formId, organizationId);

  if (!detail) {
    return notFound();
  }

  return json({
    success: true,
    data: mapAdminFormDetailResponse(detail)
  });
}
