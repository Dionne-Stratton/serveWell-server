import type { AdminSubmissionDetail } from "../db/adminSubmissions";
import {
  labelAvailabilityKey,
  labelExperienceLevel,
  labelOverallFrequency
} from "./planningCenterDisplayLabels";

export interface PlanningCenterVolunteerFieldValues {
  overallFrequency: string;
  frequencyLimits: string;
  availability: string;
  servingAreas: string;
  requirements: string;
  specialEvents: string;
  lastSynced: string;
  supplementalNote: string | null;
}

export function buildPlanningCenterVolunteerFieldValues(
  detail: AdminSubmissionDetail,
  syncedOnIsoDate: string
): PlanningCenterVolunteerFieldValues {
  const { submission, interests, requirementConfirmations } = detail;

  return {
    overallFrequency: labelOverallFrequency(submission.overallFrequency),
    frequencyLimits: formatFrequencyLimits(submission.overallFrequency, interests),
    availability: formatAvailability(submission.availability),
    servingAreas: formatServingAreas(interests),
    requirements: formatRequirements(requirementConfirmations),
    specialEvents: submission.openToSpecialEvents ? "true" : "false",
    lastSynced: syncedOnIsoDate.slice(0, 10),
    supplementalNote: formatSupplementalNote(submission.experienceNotes, submission.additionalNotes)
  };
}

function formatFrequencyLimits(
  overallFrequency: string,
  interests: AdminSubmissionDetail["interests"]
): string {
  const lines: string[] = [];

  for (const interest of interests) {
    if (!interest.usesAreaSpecificFrequency || !interest.areaSpecificFrequency) {
      continue;
    }

    if (interest.areaSpecificFrequency === overallFrequency) {
      continue;
    }

    const label = labelOverallFrequency(interest.areaSpecificFrequency);
    lines.push(`${interest.servingAreaName}: ${label}`);
  }

  return lines.join("\n");
}

function formatAvailability(availability: string[]): string {
  return availability.map((key) => labelAvailabilityKey(key)).join("\n");
}

function formatServingAreas(interests: AdminSubmissionDetail["interests"]): string {
  const blocks: string[] = [];

  for (const interest of interests) {
    const experience = labelExperienceLevel(interest.experienceLevel);
    const headline = experience
      ? `${interest.servingAreaName} — ${experience}`
      : interest.servingAreaName;

    const notes = interest.interestNotes?.trim();
    blocks.push(notes ? `${headline}\n  ${notes}` : headline);
  }

  return blocks.join("\n");
}

function formatRequirements(
  confirmations: AdminSubmissionDetail["requirementConfirmations"]
): string {
  const lines = confirmations
    .filter((row) => row.confirmed)
    .map((row) => `${row.servingAreaName} — ${row.label}: Acknowledged`);

  return lines.join("\n");
}

function formatSupplementalNote(
  experienceNotes: string | null,
  additionalNotes: string | null
): string | null {
  const parts: string[] = [];

  if (experienceNotes?.trim()) {
    parts.push(`Experience notes:\n${experienceNotes.trim()}`);
  }

  if (additionalNotes?.trim()) {
    parts.push(`Additional notes:\n${additionalNotes.trim()}`);
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join("\n\n");
}
