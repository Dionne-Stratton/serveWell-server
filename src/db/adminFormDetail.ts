import type { Env } from "../types";
import { getAdminFormById, mapAdminForm, type AdminFormRecord } from "./adminForms";
import {
  listFormSections,
  mapAdminSection,
  type FormSectionRecord
} from "./formSections";
import {
  listAdminServingAreasForForm,
  mapAdminServingArea,
  type AdminServingAreaRecord
} from "./adminServingAreas";
import {
  listRequirementsForServingAreaIds,
  mapAdminRequirement,
  type AdminRequirementRecord
} from "./adminRequirements";

export type AdminFormDetailSection = {
  section: FormSectionRecord;
  servingAreas: Array<
    AdminServingAreaRecord & { requirements: AdminRequirementRecord[] }
  >;
};

export async function getAdminFormDetail(
  env: Env,
  formId: number,
  organizationId: number
): Promise<{ form: AdminFormRecord; sections: AdminFormDetailSection[] } | null> {
  const form = await getAdminFormById(env, formId, organizationId);

  if (!form) {
    return null;
  }

  const sections = await listFormSections(env, organizationId, formId);
  const areas = await listAdminServingAreasForForm(env, organizationId, formId);
  const requirementMap = await listRequirementsForServingAreaIds(
    env,
    organizationId,
    formId,
    areas.map((area) => area.id)
  );

  const areasBySection = new Map<number, AdminFormDetailSection["servingAreas"]>();

  for (const section of sections) {
    areasBySection.set(section.id, []);
  }

  const unsectioned: AdminFormDetailSection["servingAreas"] = [];

  for (const area of areas) {
    const requirements = requirementMap.get(area.id) ?? [];
    const payload = { ...area, requirements };

    if (area.sectionId && areasBySection.has(area.sectionId)) {
      areasBySection.get(area.sectionId)!.push(payload);
    } else {
      unsectioned.push(payload);
    }
  }

  const detailSections: AdminFormDetailSection[] = sections.map((section) => ({
    section,
    servingAreas: areasBySection.get(section.id) ?? []
  }));

  if (unsectioned.length > 0) {
    detailSections.push({
      section: {
        id: 0,
        organizationId,
        formId,
        title: "Uncategorized",
        sortOrder: 9999
      },
      servingAreas: unsectioned
    });
  }

  return { form, sections: detailSections };
}

export function mapAdminFormDetailResponse(detail: {
  form: AdminFormRecord;
  sections: AdminFormDetailSection[];
}) {
  return {
    form: mapAdminForm(detail.form),
    sections: detail.sections
      .filter((entry) => entry.section.id !== 0)
      .map((entry) => ({
        ...mapAdminSection(entry.section),
        servingAreas: entry.servingAreas.map((area) => ({
          ...mapAdminServingArea(area),
          requirements: area.requirements.map(mapAdminRequirement)
        }))
      }))
  };
}

export async function deleteAdminVolunteerForm(
  env: Env,
  formId: number,
  organizationId: number
): Promise<boolean> {
  const form = await getAdminFormById(env, formId, organizationId);

  if (!form) {
    return false;
  }

  const result = await env.DB.prepare(
    `DELETE FROM volunteer_forms WHERE id = ? AND organization_id = ?`
  )
    .bind(formId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
