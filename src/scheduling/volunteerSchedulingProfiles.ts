import { frequencyOptions } from "../validation/enums";
import type { Env } from "../types";
import { isSchedulingReadySubmissionStatus } from "../lib/submissionStatus";

export type FrequencyOption = (typeof frequencyOptions)[number];

export interface VolunteerInterestProfile {
  servingAreaId: number;
  usesAreaSpecificFrequency: boolean;
  areaSpecificFrequency: string | null;
  experienceLevel: string | null;
}

export interface BlackoutRange {
  startDate: string;
  endDate: string;
}

export interface VolunteerSchedulingProfile {
  submissionId: number;
  status: string;
  overallFrequency: FrequencyOption;
  interestsByServingAreaId: Map<number, VolunteerInterestProfile>;
  availabilityKeys: Set<string>;
  blackoutRanges: BlackoutRange[];
  confirmedRequirementKeys: Set<string>;
  lastServedDate: string | null;
}

export function effectiveFrequencyForServingArea(
  profile: VolunteerSchedulingProfile,
  servingAreaId: number,
  overallFrequency: FrequencyOption
): FrequencyOption {
  const interest = profile.interestsByServingAreaId.get(servingAreaId);

  if (!interest) {
    return overallFrequency;
  }

  if (interest.usesAreaSpecificFrequency && interest.areaSpecificFrequency) {
    const value = interest.areaSpecificFrequency;

    if ((frequencyOptions as readonly string[]).includes(value)) {
      return value as FrequencyOption;
    }
  }

  return overallFrequency;
}

export function experiencePreferenceScore(experienceLevel: string | null): number {
  switch (experienceLevel) {
    case "experienced":
      return 24;
    case "some":
      return 12;
    case "none":
      return 4;
    case "not_sure":
      return 8;
    default:
      return 6;
  }
}

export function isDateInBlackout(ranges: BlackoutRange[], occurrenceDate: string): boolean {
  for (const range of ranges) {
    if (occurrenceDate >= range.startDate && occurrenceDate <= range.endDate) {
      return true;
    }
  }

  return false;
}

export async function loadVolunteerSchedulingProfiles(
  env: Env,
  organizationId: number
): Promise<Map<number, VolunteerSchedulingProfile>> {
  const submissions = await env.DB.prepare(
    `
    SELECT id, status, overall_frequency
    FROM volunteer_submissions
    WHERE organization_id = ?
      AND is_archived = 0
    `
  )
    .bind(organizationId)
    .all<{ id: number; status: string; overall_frequency: string }>();

  const profiles = new Map<number, VolunteerSchedulingProfile>();

  for (const row of submissions.results ?? []) {
    if (!isSchedulingReadySubmissionStatus(row.status)) {
      continue;
    }

    const overall = (frequencyOptions as readonly string[]).includes(row.overall_frequency)
      ? (row.overall_frequency as FrequencyOption)
      : "flexible";

    profiles.set(row.id, {
      submissionId: row.id,
      status: row.status,
      overallFrequency: overall,
      interestsByServingAreaId: new Map(),
      availabilityKeys: new Set(),
      blackoutRanges: [],
      confirmedRequirementKeys: new Set(),
      lastServedDate: null
    });
  }

  if (profiles.size === 0) {
    return new Map();
  }

  const ids = [...profiles.keys()];
  const placeholders = ids.map(() => "?").join(", ");

  const interests = await env.DB.prepare(
    `
    SELECT
      submission_id,
      serving_area_id,
      uses_area_specific_frequency,
      area_specific_frequency,
      experience_level
    FROM volunteer_interests
    WHERE submission_id IN (${placeholders})
    `
  )
    .bind(...ids)
    .all<{
      submission_id: number;
      serving_area_id: number;
      uses_area_specific_frequency: number;
      area_specific_frequency: string | null;
      experience_level: string | null;
    }>();

  for (const row of interests.results ?? []) {
    const profile = profiles.get(row.submission_id);

    if (!profile) {
      continue;
    }

    profile.interestsByServingAreaId.set(row.serving_area_id, {
      servingAreaId: row.serving_area_id,
      usesAreaSpecificFrequency: Boolean(row.uses_area_specific_frequency),
      areaSpecificFrequency: row.area_specific_frequency,
      experienceLevel: row.experience_level
    });
  }

  const availability = await env.DB.prepare(
    `
    SELECT submission_id, availability_key
    FROM volunteer_availability
    WHERE submission_id IN (${placeholders})
    `
  )
    .bind(...ids)
    .all<{ submission_id: number; availability_key: string }>();

  for (const row of availability.results ?? []) {
    profiles.get(row.submission_id)?.availabilityKeys.add(row.availability_key);
  }

  const blackouts = await env.DB.prepare(
    `
    SELECT submission_id, start_date, end_date
    FROM submission_blackout_dates
    WHERE submission_id IN (${placeholders})
    `
  )
    .bind(...ids)
    .all<{ submission_id: number; start_date: string; end_date: string }>();

  for (const row of blackouts.results ?? []) {
    const profile = profiles.get(row.submission_id);

    if (profile) {
      profile.blackoutRanges.push({
        startDate: row.start_date,
        endDate: row.end_date
      });
    }
  }

  const confirmations = await env.DB.prepare(
    `
    SELECT submission_id, serving_area_id, requirement_id, confirmed
    FROM volunteer_requirement_confirmations
    WHERE submission_id IN (${placeholders})
    `
  )
    .bind(...ids)
    .all<{
      submission_id: number;
      serving_area_id: number;
      requirement_id: number;
      confirmed: number;
    }>();

  for (const row of confirmations.results ?? []) {
    if (row.confirmed !== 1) {
      continue;
    }

    profiles
      .get(row.submission_id)
      ?.confirmedRequirementKeys.add(`${row.serving_area_id}:${row.requirement_id}`);
  }

  const lastServed = await env.DB.prepare(
    `
    SELECT a.submission_id, MAX(gso.occurrence_date) AS last_date
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrences gso ON gso.id = a.occurrence_id
    INNER JOIN generated_schedules gs ON gs.id = gso.generated_schedule_id
    WHERE a.organization_id = ?
      AND gs.organization_id = ?
      AND gs.status = 'published'
      AND a.submission_id IN (${placeholders})
    GROUP BY a.submission_id
    `
  )
    .bind(organizationId, organizationId, ...ids)
    .all<{ submission_id: number; last_date: string }>();

  for (const row of lastServed.results ?? []) {
    const profile = profiles.get(row.submission_id);

    if (profile) {
      profile.lastServedDate = row.last_date;
    }
  }

  const result = new Map<number, VolunteerSchedulingProfile>();

  for (const profile of profiles.values()) {
    result.set(profile.submissionId, profile);
  }

  return result;
}

export interface MandatoryServingAreaRequirement {
  servingAreaId: number;
  requirementId: number;
  requirementType: string;
  dayOfWeek: string | null;
  requiresConfirmation: boolean;
}

export async function loadMandatoryServingAreaRequirements(
  env: Env,
  organizationId: number
): Promise<MandatoryServingAreaRequirement[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      sar.id AS requirement_id,
      sar.serving_area_id,
      sar.requirement_type,
      sar.day_of_week,
      sar.requires_confirmation,
      sar.is_mandatory
    FROM serving_area_requirements sar
    INNER JOIN serving_areas sa ON sa.id = sar.serving_area_id
    WHERE sa.organization_id = ?
      AND sar.is_mandatory = 1
    `
  )
    .bind(organizationId)
    .all<{
      requirement_id: number;
      serving_area_id: number;
      requirement_type: string;
      day_of_week: string | null;
      requires_confirmation: number;
      is_mandatory: number;
    }>();

  return (result.results ?? []).map((row) => ({
    servingAreaId: row.serving_area_id,
    requirementId: row.requirement_id,
    requirementType: row.requirement_type,
    dayOfWeek: row.day_of_week,
    requiresConfirmation: row.requires_confirmation === 1
  }));
}
