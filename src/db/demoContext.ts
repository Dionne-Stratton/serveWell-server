import {
  findActiveOrganizationBySlug,
  findActiveVolunteerFormBySlug,
  findDefaultActiveVolunteerForm,
  type Organization,
  type VolunteerForm
} from "./organizations";
import type { VolunteerSubmissionScope } from "./volunteerSubmissions";
import type { Env } from "../types";

export interface DemoVolunteerFormContext {
  organization: Organization;
  form: VolunteerForm;
  scope: VolunteerSubmissionScope;
}

/** Transitional helper: legacy public routes resolve to the seeded demo tenant. */
export async function resolveDemoVolunteerFormContext(
  env: Env
): Promise<DemoVolunteerFormContext | null> {
  const organization = await findActiveOrganizationBySlug(env, "demo");

  if (!organization) {
    return null;
  }

  const form =
    (await findActiveVolunteerFormBySlug(env, organization.id, "general-serving")) ??
    (await findDefaultActiveVolunteerForm(env, organization.id));

  if (!form) {
    return null;
  }

  return {
    organization,
    form,
    scope: {
      organizationId: organization.id,
      formId: form.id
    }
  };
}
