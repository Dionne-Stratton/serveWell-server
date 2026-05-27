import type { Env } from "../types";

interface ServingAreaRow {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  public_note: string | null;
  requires_background_check: number;
  requires_training: number;
  requires_audition_or_interview: number;
  requirement_id: number | null;
  requirement_type: string | null;
  requirement_label: string | null;
  requirement_description: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  is_mandatory: number | null;
  requires_confirmation: number | null;
}

export interface ServingAreaRequirement {
  id: number;
  type: string;
  label: string;
  description: string | null;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  isMandatory: boolean;
  requiresConfirmation: boolean;
}

export interface ServingArea {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  publicNote: string | null;
  requiresBackgroundCheck: boolean;
  requiresTraining: boolean;
  requiresAuditionOrInterview: boolean;
  requirements: ServingAreaRequirement[];
}

export async function listServingAreasForForm(
  env: Env,
  organizationId: number,
  formId: number
): Promise<ServingArea[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      sa.id,
      sa.slug,
      sa.name,
      sa.category,
      sa.description,
      sa.public_note,
      sa.requires_background_check,
      sa.requires_training,
      sa.requires_audition_or_interview,
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
    WHERE sa.is_active = 1
      AND sa.organization_id = ?
      AND sa.form_id = ?
    ORDER BY sa.sort_order ASC, sa.name ASC, sar.sort_order ASC, sar.id ASC
    `
  )
    .bind(organizationId, formId)
    .all<ServingAreaRow>();

  return mapServingAreaRows(result.results ?? []);
}

function mapServingAreaRows(rows: ServingAreaRow[]): ServingArea[] {
  const servingAreas = new Map<number, ServingArea>();

  for (const row of rows) {
    const existing = servingAreas.get(row.id);
    const servingArea =
      existing ??
      {
        id: row.id,
        slug: row.slug,
        name: row.name,
        category: row.category,
        description: row.description,
        publicNote: row.public_note,
        requiresBackgroundCheck: Boolean(row.requires_background_check),
        requiresTraining: Boolean(row.requires_training),
        requiresAuditionOrInterview: Boolean(row.requires_audition_or_interview),
        requirements: []
      };

    if (!existing) {
      servingAreas.set(row.id, servingArea);
    }

    if (row.requirement_id !== null && row.requirement_type && row.requirement_label) {
      servingArea.requirements.push({
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

  return Array.from(servingAreas.values());
}
