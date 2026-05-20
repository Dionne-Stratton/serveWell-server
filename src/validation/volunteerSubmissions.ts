import {
  availabilityKeys,
  experienceLevels,
  frequencyOptions,
  isOneOf,
  preferredContactMethods
} from "./enums";
import type {
  CreateVolunteerSubmissionInput,
  RequirementConfirmationInput,
  VolunteerInterestInput
} from "../db/volunteerSubmissions";
import type { Env } from "../types";

interface RequirementRow {
  serving_area_id: number;
  serving_area_name: string;
  requirement_id: number | null;
  requirement_type: string | null;
  requirement_label: string | null;
  day_of_week: string | null;
  is_mandatory: number | null;
  requires_confirmation: number | null;
}

interface ValidationResult {
  input?: CreateVolunteerSubmissionInput;
  error?: string;
}

export async function validateVolunteerSubmission(
  env: Env,
  body: unknown
): Promise<ValidationResult> {
  if (!isRecord(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const firstName = normalizeRequiredString(body.firstName);
  const lastName = normalizeRequiredString(body.lastName);
  const email = normalizeOptionalString(body.email);
  const phone = normalizeOptionalString(body.phone);
  const preferredContactMethod = body.preferredContactMethod;
  const overallFrequency = body.overallFrequency;

  if (!firstName) return { error: "First name is required." };
  if (!lastName) return { error: "Last name is required." };
  if (!email && !phone) return { error: "Please provide an email address or phone number." };

  if (!isOneOf(preferredContactMethod, preferredContactMethods)) {
    return { error: "Preferred contact method is required." };
  }

  if (!isOneOf(overallFrequency, frequencyOptions)) {
    return { error: "Overall serving frequency is required." };
  }

  const availability = normalizeStringArray(body.availability);

  if (!availability) {
    return { error: "Availability must be a list of availability options." };
  }

  for (const availabilityKey of availability) {
    if (!isOneOf(availabilityKey, availabilityKeys)) {
      return { error: `Invalid availability option: ${availabilityKey}.` };
    }
  }

  const interests = normalizeInterests(body.interests);

  if (typeof interests === "string") {
    return { error: interests };
  }

  if (interests.length === 0) {
    return { error: "Please select at least one serving area." };
  }

  const requirementConfirmations = normalizeRequirementConfirmations(body.requirementConfirmations);

  if (typeof requirementConfirmations === "string") {
    return { error: requirementConfirmations };
  }

  const servingAreaError = await validateServingAreaRules(
    env,
    interests,
    requirementConfirmations,
    availability
  );

  if (servingAreaError) {
    return { error: servingAreaError };
  }

  return {
    input: {
      firstName,
      lastName,
      email,
      phone,
      preferredContactMethod,
      overallFrequency,
      availability,
      openToSpecialEvents: Boolean(body.openToSpecialEvents),
      experienceNotes: normalizeOptionalString(body.experienceNotes),
      additionalNotes: normalizeOptionalString(body.additionalNotes),
      interests,
      requirementConfirmations
    }
  };
}

function normalizeInterests(value: unknown): VolunteerInterestInput[] | string {
  if (!Array.isArray(value)) {
    return "Serving interests must be a list.";
  }

  const interests: VolunteerInterestInput[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return "Each serving interest must be an object.";
    }

    const servingAreaId = normalizePositiveInteger(item.servingAreaId);

    if (!servingAreaId) {
      return "Each serving interest must include a valid serving area.";
    }

    const usesAreaSpecificFrequency = Boolean(item.usesAreaSpecificFrequency);
    const areaSpecificFrequency = normalizeOptionalString(item.areaSpecificFrequency);

    if (usesAreaSpecificFrequency && !isOneOf(areaSpecificFrequency, frequencyOptions)) {
      return "Area-specific frequency is required when limiting frequency for an area.";
    }

    if (areaSpecificFrequency && !isOneOf(areaSpecificFrequency, frequencyOptions)) {
      return `Invalid area-specific frequency: ${areaSpecificFrequency}.`;
    }

    const experienceLevel = normalizeOptionalString(item.experienceLevel);

    if (experienceLevel && !isOneOf(experienceLevel, experienceLevels)) {
      return `Invalid experience level: ${experienceLevel}.`;
    }

    interests.push({
      servingAreaId,
      usesAreaSpecificFrequency,
      areaSpecificFrequency: usesAreaSpecificFrequency ? areaSpecificFrequency : null,
      experienceLevel,
      interestNotes: normalizeOptionalString(item.interestNotes)
    });
  }

  return interests;
}

function normalizeRequirementConfirmations(value: unknown): RequirementConfirmationInput[] | string {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return "Requirement confirmations must be a list.";
  }

  const confirmations: RequirementConfirmationInput[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return "Each requirement confirmation must be an object.";
    }

    const servingAreaId = normalizePositiveInteger(item.servingAreaId);
    const requirementId = normalizePositiveInteger(item.requirementId);

    if (!servingAreaId || !requirementId) {
      return "Each requirement confirmation must include a valid serving area and requirement.";
    }

    confirmations.push({
      servingAreaId,
      requirementId,
      confirmed: item.confirmed === true
    });
  }

  return confirmations;
}

async function validateServingAreaRules(
  env: Env,
  interests: VolunteerInterestInput[],
  requirementConfirmations: RequirementConfirmationInput[],
  availability: string[]
): Promise<string | null> {
  const servingAreaIds = [...new Set(interests.map((interest) => interest.servingAreaId))];
  const placeholders = servingAreaIds.map(() => "?").join(", ");
  const rows = await env.DB.prepare(
    `
    SELECT
      sa.id AS serving_area_id,
      sa.name AS serving_area_name,
      sar.id AS requirement_id,
      sar.requirement_type,
      sar.label AS requirement_label,
      sar.day_of_week,
      sar.is_mandatory,
      sar.requires_confirmation
    FROM serving_areas sa
    LEFT JOIN serving_area_requirements sar
      ON sar.serving_area_id = sa.id
    WHERE sa.is_active = 1
      AND sa.id IN (${placeholders})
    `
  )
    .bind(...servingAreaIds)
    .all<RequirementRow>();

  const foundServingAreaIds = new Set(rows.results?.map((row) => row.serving_area_id) ?? []);

  for (const servingAreaId of servingAreaIds) {
    if (!foundServingAreaIds.has(servingAreaId)) {
      return `Invalid or inactive serving area selected: ${servingAreaId}.`;
    }
  }

  const confirmedRequirementIds = new Set(
    requirementConfirmations
      .filter((confirmation) => confirmation.confirmed)
      .map((confirmation) => `${confirmation.servingAreaId}:${confirmation.requirementId}`)
  );

  for (const row of rows.results ?? []) {
    if (row.requirement_id === null || row.is_mandatory !== 1) {
      continue;
    }

    if (row.requires_confirmation === 1) {
      const key = `${row.serving_area_id}:${row.requirement_id}`;

      if (!confirmedRequirementIds.has(key)) {
        return `${row.serving_area_name} requires confirmation for: ${row.requirement_label}.`;
      }
    }

    if (row.requirement_type === "availability") {
      const requiredAvailability = availabilityKeyForRequirement(row.day_of_week);

      if (requiredAvailability && !availability.includes(requiredAvailability)) {
        return `${row.serving_area_name} usually requires ${availabilityLabel(requiredAvailability)} availability. Please select that availability or remove ${row.serving_area_name} from your serving interests.`;
      }
    }
  }

  return null;
}

function availabilityKeyForRequirement(dayOfWeek: string | null): string | null {
  const availabilityByDay: Record<string, string> = {
    sunday: "sunday_morning",
    tuesday: "tuesday_night",
    wednesday: "wednesday_night"
  };

  return dayOfWeek ? availabilityByDay[dayOfWeek] ?? null : null;
}

function availabilityLabel(availabilityKey: string): string {
  const labels: Record<string, string> = {
    sunday_morning: "Sunday morning",
    tuesday_night: "Tuesday night",
    wednesday_night: "Wednesday night",
    special_events: "special events",
    other: "other"
  };

  return labels[availabilityKey] ?? availabilityKey;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const values: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }

    values.push(item);
  }

  return values;
}

function normalizeRequiredString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized && normalized.length > 0 ? normalized : null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
