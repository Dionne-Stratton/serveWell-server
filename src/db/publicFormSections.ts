import type { Env } from "../types";
import { normalizeRecruitmentStatus } from "../lib/recruitmentStatus";
import { listFormSections, mapPublicSection } from "./formSections";
import type { ServingArea } from "./servingAreas";

interface ServingAreaRow {
  id: number;
  section_id: number | null;
  slug: string;
  name: string;
  description: string | null;
  public_note: string | null;
  requires_background_check: number;
  requires_training: number;
  requires_audition_or_interview: number;
  recruitment_status: string;
  requirement_id: number | null;
  requirement_type: string | null;
  requirement_label: string | null;
  requirement_description: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  is_mandatory: number | null;
  requires_confirmation: number | null;
  sort_order: number;
}

export async function buildPublicFormSections(
  env: Env,
  organizationId: number,
  formId: number
): Promise<Array<{ id: number; title: string; servingAreas: ServingArea[] }>> {
  const sections = await listFormSections(env, organizationId, formId);

  const result = await env.DB.prepare(
    `
    SELECT
      sa.id,
      sa.section_id,
      sa.slug,
      sa.name,
      sa.description,
      sa.public_note,
      sa.requires_background_check,
      sa.requires_training,
      sa.requires_audition_or_interview,
      sa.recruitment_status,
      sa.sort_order,
      sar.id AS requirement_id,
      sar.requirement_type,
      sar.label AS requirement_label,
      sar.description AS requirement_description,
      sar.day_of_week,
      sar.start_time,
      sar.end_time,
      sar.is_mandatory,
      sar.requires_confirmation
    FROM serving_areas sa
    LEFT JOIN serving_area_requirements sar
      ON sar.serving_area_id = sa.id
    WHERE sa.recruitment_status IN ('open', 'needed', 'urgent')
      AND sa.organization_id = ?
      AND sa.form_id = ?
    ORDER BY sa.sort_order ASC, sa.name ASC, sar.sort_order ASC, sar.id ASC
    `
  )
    .bind(organizationId, formId)
    .all<ServingAreaRow>();

  const areasBySectionId = new Map<number, ServingArea[]>();

  for (const section of sections) {
    areasBySectionId.set(section.id, []);
  }

  const areaBuilders = new Map<number, ServingArea>();

  for (const row of result.results ?? []) {
    let area = areaBuilders.get(row.id);

    if (!area) {
      area = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        category: "",
        description: row.description,
        publicNote: row.public_note,
        requiresBackgroundCheck: Boolean(row.requires_background_check),
        requiresTraining: Boolean(row.requires_training),
        requiresAuditionOrInterview: Boolean(row.requires_audition_or_interview),
        recruitmentStatus: normalizeRecruitmentStatus(row.recruitment_status, true),
        requirements: []
      };
      areaBuilders.set(row.id, area);

      if (row.section_id && areasBySectionId.has(row.section_id)) {
        areasBySectionId.get(row.section_id)!.push(area);
      }
    }

    if (row.requirement_id !== null && row.requirement_type && row.requirement_label) {
      area.requirements.push({
        id: row.requirement_id,
        type: row.requirement_type,
        label: row.requirement_label,
        description: row.requirement_description,
        dayOfWeek: row.day_of_week,
        startTime: row.start_time,
        endTime: row.end_time,
        isMandatory: Boolean(row.is_mandatory),
        requiresConfirmation: Boolean(row.requires_confirmation)
      });
    }
  }

  const publicSections: Array<{ id: number; title: string; servingAreas: ServingArea[] }> = [];

  for (const section of sections) {
    const servingAreas = areasBySectionId.get(section.id) ?? [];

    if (servingAreas.length === 0) {
      continue;
    }

    publicSections.push(mapPublicSection(section, servingAreas));
  }

  return publicSections;
}

export function flattenPublicSections(
  sections: Array<{ servingAreas: ServingArea[] }>
): ServingArea[] {
  return sections.flatMap((section) => section.servingAreas);
}
