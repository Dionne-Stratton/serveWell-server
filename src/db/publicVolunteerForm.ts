import {
  mapPublicForm,
  mapPublicOrganization,
  type Organization,
  type VolunteerForm
} from "./organizations";
import { listServingAreasForForm } from "./servingAreas";
import type { Env } from "../types";

export async function buildPublicVolunteerFormPayload(
  env: Env,
  organization: Organization,
  form: VolunteerForm
) {
  const servingAreas = await listServingAreasForForm(env, organization.id, form.id);

  return {
    organization: mapPublicOrganization(organization),
    form: mapPublicForm(form),
    servingAreas
  };
}

export function defaultSubmissionSuccessMessage(form: VolunteerForm): string {
  return (
    form.successMessage ??
    "Thank you! Your interest has been submitted. Someone from the church will follow up with you soon."
  );
}
