import type { Env } from "../types";

export interface AdminSubmissionListItem {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContactMethod: string;
  overallFrequency: string;
  availability: string[];
  openToSpecialEvents: boolean;
  status: string;
  isArchived: boolean;
  servingAreas: string[];
  requiresBackgroundCheck: boolean;
  requiresTraining: boolean;
  createdAt: string;
}

export interface AdminSubmissionFilters {
  status?: string;
  archived?: boolean;
  servingAreaId?: number;
  search?: string;
}

interface AdminSubmissionRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact_method: string;
  overall_frequency: string;
  open_to_special_events: number;
  status: string;
  is_archived: number;
  serving_areas: string | null;
  availability: string | null;
  requires_background_check: number;
  requires_training: number;
  created_at: string;
}

export async function listAdminSubmissions(
  env: Env,
  filters: AdminSubmissionFilters
): Promise<AdminSubmissionListItem[]> {
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];

  if (filters.status) {
    conditions.push("vs.status = ?");
    bindings.push(filters.status);
  }

  if (typeof filters.archived === "boolean") {
    conditions.push("vs.is_archived = ?");
    bindings.push(filters.archived ? 1 : 0);
  }

  if (filters.servingAreaId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM volunteer_interests vi_filter WHERE vi_filter.submission_id = vs.id AND vi_filter.serving_area_id = ?)"
    );
    bindings.push(filters.servingAreaId);
  }

  if (filters.search) {
    conditions.push(
      "(lower(vs.first_name) LIKE ? OR lower(vs.last_name) LIKE ? OR lower(vs.email) LIKE ? OR lower(vs.phone) LIKE ?)"
    );
    const searchValue = `%${filters.search.toLowerCase()}%`;
    bindings.push(searchValue, searchValue, searchValue, searchValue);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await env.DB.prepare(
    `
    SELECT
      vs.id,
      vs.first_name,
      vs.last_name,
      vs.email,
      vs.phone,
      vs.preferred_contact_method,
      vs.overall_frequency,
      vs.open_to_special_events,
      vs.status,
      vs.is_archived,
      vs.created_at,
      GROUP_CONCAT(DISTINCT sa.name) AS serving_areas,
      GROUP_CONCAT(DISTINCT va.availability_key) AS availability,
      MAX(sa.requires_background_check) AS requires_background_check,
      MAX(sa.requires_training) AS requires_training
    FROM volunteer_submissions vs
    LEFT JOIN volunteer_interests vi
      ON vi.submission_id = vs.id
    LEFT JOIN serving_areas sa
      ON sa.id = vi.serving_area_id
    LEFT JOIN volunteer_availability va
      ON va.submission_id = vs.id
    ${whereClause}
    GROUP BY vs.id
    ORDER BY vs.created_at DESC, vs.id DESC
    `
  )
    .bind(...bindings)
    .all<AdminSubmissionRow>();

  return (result.results ?? []).map(mapAdminSubmissionListItem);
}

function mapAdminSubmissionListItem(row: AdminSubmissionRow): AdminSubmissionListItem {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    preferredContactMethod: row.preferred_contact_method,
    overallFrequency: row.overall_frequency,
    availability: splitGroupConcat(row.availability),
    openToSpecialEvents: Boolean(row.open_to_special_events),
    status: row.status,
    isArchived: Boolean(row.is_archived),
    servingAreas: splitGroupConcat(row.serving_areas),
    requiresBackgroundCheck: Boolean(row.requires_background_check),
    requiresTraining: Boolean(row.requires_training),
    createdAt: row.created_at
  };
}

function splitGroupConcat(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(",").filter(Boolean);
}
