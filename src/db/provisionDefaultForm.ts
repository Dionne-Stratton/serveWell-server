import {
  CHURCH_VOLUNTEER_DEFAULT_FORM,
  CHURCH_VOLUNTEER_DEFAULT_REQUIREMENTS,
  CHURCH_VOLUNTEER_DEFAULT_SERVING_AREAS,
  CHURCH_VOLUNTEER_DEFAULT_TEMPLATE_KEY,
  type ProvisionedDefaultForm
} from "../templates/churchVolunteerDefault";
import { sectionTitleForCategory } from "../constants/categorySectionTitles";
import { createFormSection } from "./formSections";
import type { Env } from "../types";

export async function provisionChurchVolunteerDefaultStructure(
  env: Env,
  organizationId: number,
  formId: number
): Promise<void> {
  const areaIdBySlug = new Map<string, number>();
  const sectionIdByCategory = new Map<string, number>();

  for (const area of CHURCH_VOLUNTEER_DEFAULT_SERVING_AREAS) {
    if (!sectionIdByCategory.has(area.category)) {
      const { title, sortOrder } = sectionTitleForCategory(area.category);
      const section = await createFormSection(
        env,
        organizationId,
        formId,
        title,
        sortOrder
      );
      sectionIdByCategory.set(area.category, section.id);
    }

    const sectionId = sectionIdByCategory.get(area.category)!;

    const areaInsert = await env.DB.prepare(
      `
      INSERT INTO serving_areas (
        organization_id,
        form_id,
        section_id,
        slug,
        name,
        category,
        description,
        public_note,
        requires_background_check,
        requires_training,
        requires_audition_or_interview,
        sort_order,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `
    )
      .bind(
        organizationId,
        formId,
        sectionId,
        area.slug,
        area.name,
        area.category,
        area.description,
        area.publicNote,
        area.requiresBackgroundCheck ? 1 : 0,
        area.requiresTraining ? 1 : 0,
        area.requiresAuditionOrInterview ? 1 : 0,
        area.sortOrder
      )
      .run();

    const servingAreaId = areaInsert.meta.last_row_id;

    if (!servingAreaId) {
      throw new Error(`Serving area insert failed for slug ${area.slug}.`);
    }

    areaIdBySlug.set(area.slug, servingAreaId);
  }

  for (const requirement of CHURCH_VOLUNTEER_DEFAULT_REQUIREMENTS) {
    const servingAreaId = areaIdBySlug.get(requirement.servingAreaSlug);

    if (!servingAreaId) {
      throw new Error(
        `Missing serving area for requirement template: ${requirement.servingAreaSlug}.`
      );
    }

    await env.DB.prepare(
      `
      INSERT INTO serving_area_requirements (
        organization_id,
        form_id,
        serving_area_id,
        requirement_type,
        label,
        description,
        day_of_week,
        start_time,
        end_time,
        is_mandatory,
        requires_confirmation,
        sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        organizationId,
        formId,
        servingAreaId,
        requirement.requirementType,
        requirement.label,
        requirement.description,
        requirement.dayOfWeek,
        requirement.startTime,
        requirement.endTime,
        requirement.isMandatory ? 1 : 0,
        requirement.requiresConfirmation ? 1 : 0,
        requirement.sortOrder
      )
      .run();
  }
}

export async function provisionChurchVolunteerDefaultForm(
  env: Env,
  organizationId: number
): Promise<ProvisionedDefaultForm> {
  const form = CHURCH_VOLUNTEER_DEFAULT_FORM;

  const formInsert = await env.DB.prepare(
    `
    INSERT INTO volunteer_forms (
      organization_id,
      slug,
      name,
      description,
      intro_text,
      success_message,
      template_key,
      is_default,
      is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)
    `
  )
    .bind(
      organizationId,
      form.slug,
      form.name,
      form.description,
      form.introText,
      form.successMessage,
      form.templateKey
    )
    .run();

  const formId = formInsert.meta.last_row_id;

  if (!formId) {
    throw new Error("Default volunteer form insert did not return an id.");
  }

  await provisionChurchVolunteerDefaultStructure(env, organizationId, formId);

  return { formId, formSlug: form.slug };
}
