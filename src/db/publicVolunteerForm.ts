import {
  mapPublicForm,
  mapPublicOrganization,
  type Organization,
  type VolunteerForm
} from "./organizations";
import { buildPublicFormSections, flattenPublicSections } from "./publicFormSections";
import type { Env } from "../types";

export async function buildPublicVolunteerFormPayload(
  env: Env,
  organization: Organization,
  form: VolunteerForm
) {
  const sections = await buildPublicFormSections(env, organization.id, form.id);
  const servingAreas = flattenPublicSections(sections);

  return {
    organization: mapPublicOrganization(organization),
    form: {
      ...mapPublicForm(form),
      isActive: form.isActive
    },
    sections,
    servingAreas
  };
}

export function defaultSubmissionSuccessMessage(form: VolunteerForm): string {
  return (
    form.successMessage ??
    "Thank you! Your interest has been submitted. Someone from the church will follow up with you soon."
  );
}
