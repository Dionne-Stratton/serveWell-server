import type { Env } from "../types";

export interface VolunteerInterestInput {
  servingAreaId: number;
  usesAreaSpecificFrequency: boolean;
  areaSpecificFrequency: string | null;
  experienceLevel: string | null;
  interestNotes: string | null;
}

export interface RequirementConfirmationInput {
  servingAreaId: number;
  requirementId: number;
  confirmed: boolean;
}

export interface CreateVolunteerSubmissionInput {
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
  interests: VolunteerInterestInput[];
  requirementConfirmations: RequirementConfirmationInput[];
}

export interface VolunteerSubmissionScope {
  organizationId: number;
  formId: number;
}

interface InsertMeta {
  last_row_id?: number;
  lastRowId?: number;
}

export async function createVolunteerSubmission(
  env: Env,
  input: CreateVolunteerSubmissionInput,
  scope: VolunteerSubmissionScope
): Promise<number> {
  const insertSubmission = await env.DB.prepare(
    `
    INSERT INTO volunteer_submissions (
      organization_id,
      form_id,
      first_name,
      last_name,
      email,
      phone,
      preferred_contact_method,
      overall_frequency,
      open_to_special_events,
      experience_notes,
      additional_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      scope.organizationId,
      scope.formId,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.preferredContactMethod,
      input.overallFrequency,
      input.openToSpecialEvents ? 1 : 0,
      input.experienceNotes,
      input.additionalNotes
    )
    .run();

  const meta = insertSubmission.meta as InsertMeta;
  const submissionId = meta.last_row_id ?? meta.lastRowId;

  if (typeof submissionId !== "number") {
    throw new Error("D1 did not return a submission id.");
  }

  const relatedStatements = [
    ...input.interests.map((interest) =>
      env.DB.prepare(
        `
        INSERT INTO volunteer_interests (
          organization_id,
          form_id,
          submission_id,
          serving_area_id,
          uses_area_specific_frequency,
          area_specific_frequency,
          interest_notes,
          experience_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).bind(
        scope.organizationId,
        scope.formId,
        submissionId,
        interest.servingAreaId,
        interest.usesAreaSpecificFrequency ? 1 : 0,
        interest.areaSpecificFrequency,
        interest.interestNotes,
        interest.experienceLevel
      )
    ),
    ...input.availability.map((availabilityKey) =>
      env.DB.prepare(
        `
        INSERT INTO volunteer_availability (
          organization_id,
          form_id,
          submission_id,
          availability_key,
          label
        ) VALUES (?, ?, ?, ?, ?)
        `
      ).bind(
        scope.organizationId,
        scope.formId,
        submissionId,
        availabilityKey,
        availabilityLabel(availabilityKey)
      )
    ),
    ...input.requirementConfirmations.map((confirmation) =>
      env.DB.prepare(
        `
        INSERT INTO volunteer_requirement_confirmations (
          organization_id,
          form_id,
          submission_id,
          serving_area_id,
          requirement_id,
          confirmed
        ) VALUES (?, ?, ?, ?, ?, ?)
        `
      ).bind(
        scope.organizationId,
        scope.formId,
        submissionId,
        confirmation.servingAreaId,
        confirmation.requirementId,
        confirmation.confirmed ? 1 : 0
      )
    )
  ];

  if (relatedStatements.length > 0) {
    await env.DB.batch(relatedStatements);
  }

  return submissionId;
}

function availabilityLabel(availabilityKey: string): string {
  const labels: Record<string, string> = {
    sunday_morning: "Sunday morning",
    tuesday_night: "Tuesday night",
    wednesday_night: "Wednesday night",
    special_events: "Special events",
    other: "Other"
  };

  return labels[availabilityKey] ?? availabilityKey;
}
