import type { Env } from "../types";

export interface VolunteerIntakeSnapshot {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContactMethod: string;
  overallFrequency: string;
  availability: string[];
  openToSpecialEvents: boolean;
  experienceNotes: string | null;
  additionalNotes: string | null;
  blackoutDates: Array<{
    startDate: string;
    endDate: string;
    note: string | null;
  }>;
  interests: Array<{
    servingAreaId: number;
    servingAreaName: string;
    usesAreaSpecificFrequency: boolean;
    areaSpecificFrequency: string | null;
    experienceLevel: string | null;
    interestNotes: string | null;
  }>;
  requirementConfirmations: Array<{
    servingAreaId: number;
    requirementId: number;
    servingAreaName: string;
    label: string;
    confirmed: boolean;
  }>;
}

export async function captureVolunteerIntakeSnapshotJson(
  env: Env,
  submissionId: number
): Promise<string> {
  const snapshot = await loadVolunteerIntakeSnapshot(env, submissionId);
  return JSON.stringify(snapshot);
}

export function parseVolunteerIntakeSnapshot(
  value: string | null | undefined
): VolunteerIntakeSnapshot | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!isRecord(parsed)) {
      return null;
    }

    return normalizeSnapshot(parsed);
  } catch {
    return null;
  }
}

async function loadVolunteerIntakeSnapshot(
  env: Env,
  submissionId: number
): Promise<VolunteerIntakeSnapshot> {
  const submission = await env.DB.prepare(
    `
    SELECT
      first_name,
      last_name,
      email,
      phone,
      preferred_contact_method,
      overall_frequency,
      open_to_special_events,
      experience_notes,
      additional_notes,
      GROUP_CONCAT(DISTINCT va.availability_key) AS availability
    FROM volunteer_submissions vs
    LEFT JOIN volunteer_availability va
      ON va.submission_id = vs.id
    WHERE vs.id = ?
    GROUP BY vs.id
    LIMIT 1
    `
  )
    .bind(submissionId)
    .first<{
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      preferred_contact_method: string;
      overall_frequency: string;
      open_to_special_events: number;
      experience_notes: string | null;
      additional_notes: string | null;
      availability: string | null;
    }>();

  if (!submission) {
    throw new Error(`Submission ${submissionId} not found for snapshot`);
  }

  const [blackoutDates, interests, requirementConfirmations] = await Promise.all([
    loadBlackoutDates(env, submissionId),
    loadInterests(env, submissionId),
    loadRequirementConfirmations(env, submissionId)
  ]);

  return {
    firstName: submission.first_name,
    lastName: submission.last_name,
    email: submission.email,
    phone: submission.phone,
    preferredContactMethod: submission.preferred_contact_method,
    overallFrequency: submission.overall_frequency,
    availability: splitGroupConcat(submission.availability),
    openToSpecialEvents: Boolean(submission.open_to_special_events),
    experienceNotes: submission.experience_notes,
    additionalNotes: submission.additional_notes,
    blackoutDates,
    interests,
    requirementConfirmations
  };
}

async function loadBlackoutDates(
  env: Env,
  submissionId: number
): Promise<VolunteerIntakeSnapshot["blackoutDates"]> {
  const result = await env.DB.prepare(
    `
    SELECT start_date, end_date, note
    FROM submission_blackout_dates
    WHERE submission_id = ?
    ORDER BY start_date ASC, id ASC
    `
  )
    .bind(submissionId)
    .all<{ start_date: string; end_date: string; note: string | null }>();

  return (result.results ?? []).map((row) => ({
    startDate: row.start_date,
    endDate: row.end_date,
    note: row.note
  }));
}

async function loadInterests(
  env: Env,
  submissionId: number
): Promise<VolunteerIntakeSnapshot["interests"]> {
  const result = await env.DB.prepare(
    `
    SELECT
      vi.serving_area_id,
      COALESCE(vi.serving_area_name, sa.name) AS serving_area_name,
      vi.uses_area_specific_frequency,
      vi.area_specific_frequency,
      vi.experience_level,
      vi.interest_notes
    FROM volunteer_interests vi
    LEFT JOIN serving_areas sa
      ON sa.id = vi.serving_area_id
    WHERE vi.submission_id = ?
    ORDER BY sa.sort_order ASC, serving_area_name ASC
    `
  )
    .bind(submissionId)
    .all<{
      serving_area_id: number;
      serving_area_name: string;
      uses_area_specific_frequency: number;
      area_specific_frequency: string | null;
      experience_level: string | null;
      interest_notes: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    servingAreaId: row.serving_area_id,
    servingAreaName: row.serving_area_name,
    usesAreaSpecificFrequency: Boolean(row.uses_area_specific_frequency),
    areaSpecificFrequency: row.area_specific_frequency,
    experienceLevel: row.experience_level,
    interestNotes: row.interest_notes
  }));
}

async function loadRequirementConfirmations(
  env: Env,
  submissionId: number
): Promise<VolunteerIntakeSnapshot["requirementConfirmations"]> {
  const result = await env.DB.prepare(
    `
    SELECT
      vrc.serving_area_id,
      vrc.requirement_id,
      sa.name AS serving_area_name,
      sar.label,
      vrc.confirmed
    FROM volunteer_requirement_confirmations vrc
    INNER JOIN serving_areas sa
      ON sa.id = vrc.serving_area_id
    INNER JOIN serving_area_requirements sar
      ON sar.id = vrc.requirement_id
    WHERE vrc.submission_id = ?
    ORDER BY sa.sort_order ASC, sar.sort_order ASC
    `
  )
    .bind(submissionId)
    .all<{
      serving_area_id: number;
      requirement_id: number;
      serving_area_name: string;
      label: string;
      confirmed: number;
    }>();

  return (result.results ?? []).map((row) => ({
    servingAreaId: row.serving_area_id,
    requirementId: row.requirement_id,
    servingAreaName: row.serving_area_name,
    label: row.label,
    confirmed: Boolean(row.confirmed)
  }));
}

function splitGroupConcat(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(",").filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSnapshot(record: Record<string, unknown>): VolunteerIntakeSnapshot {
  return {
    firstName: stringField(record.firstName),
    lastName: stringField(record.lastName),
    email: nullableString(record.email),
    phone: nullableString(record.phone),
    preferredContactMethod: stringField(record.preferredContactMethod),
    overallFrequency: stringField(record.overallFrequency),
    availability: stringArray(record.availability),
    openToSpecialEvents: Boolean(record.openToSpecialEvents),
    experienceNotes: nullableString(record.experienceNotes),
    additionalNotes: nullableString(record.additionalNotes),
    blackoutDates: normalizeBlackoutDates(record.blackoutDates),
    interests: normalizeInterests(record.interests),
    requirementConfirmations: normalizeConfirmations(record.requirementConfirmations)
  };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function normalizeBlackoutDates(
  value: unknown
): VolunteerIntakeSnapshot["blackoutDates"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const startDate = stringField(item.startDate);

      if (!startDate) {
        return null;
      }

      return {
        startDate,
        endDate: stringField(item.endDate) || startDate,
        note: nullableString(item.note)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function normalizeInterests(value: unknown): VolunteerIntakeSnapshot["interests"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const servingAreaId = Number(item.servingAreaId);

      if (!Number.isFinite(servingAreaId)) {
        return null;
      }

      return {
        servingAreaId,
        servingAreaName: stringField(item.servingAreaName),
        usesAreaSpecificFrequency: Boolean(item.usesAreaSpecificFrequency),
        areaSpecificFrequency: nullableString(item.areaSpecificFrequency),
        experienceLevel: nullableString(item.experienceLevel),
        interestNotes: nullableString(item.interestNotes)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

function normalizeConfirmations(
  value: unknown
): VolunteerIntakeSnapshot["requirementConfirmations"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const servingAreaId = Number(item.servingAreaId);
      const requirementId = Number(item.requirementId);

      if (!Number.isFinite(servingAreaId) || !Number.isFinite(requirementId)) {
        return null;
      }

      return {
        servingAreaId,
        requirementId,
        servingAreaName: stringField(item.servingAreaName),
        label: stringField(item.label),
        confirmed: Boolean(item.confirmed)
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}
