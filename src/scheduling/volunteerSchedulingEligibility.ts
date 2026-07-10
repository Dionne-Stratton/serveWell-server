import { volunteerHasAvailabilityForRhythm } from "./availabilityForRhythm";
import {
  calendarMonthKey,
  frequencyPreferenceScore,
  maxAssignmentsInScheduleForFrequency,
  maxAssignmentsPerMonthForFrequency
} from "./frequencyLimits";
import type { MandatoryServingAreaRequirement } from "./volunteerSchedulingProfiles";
import {
  effectiveFrequencyForServingArea,
  experiencePreferenceScore,
  isDateInBlackout,
  type VolunteerSchedulingProfile
} from "./volunteerSchedulingProfiles";

export interface RequirementAssignContext {
  servingAreaId: number;
  rhythmDayOfWeek: string;
  occurrenceDate: string;
  scheduleStartDate: string;
  scheduleEndDate: string;
  assignmentsInSchedule: number;
  assignmentsInMonth: number;
  assignedOnOccurrence: boolean;
  mandatoryRequirementsByServingArea: Map<number, MandatoryServingAreaRequirement[]>;
}

function mandatoryRequirementsSatisfied(
  profile: VolunteerSchedulingProfile,
  servingAreaId: number,
  rhythmDayOfWeek: string,
  mandatoryByArea: Map<number, MandatoryServingAreaRequirement[]>
): boolean {
  const rules = mandatoryByArea.get(servingAreaId) ?? [];

  for (const rule of rules) {
    if (rule.requiresConfirmation) {
      const key = `${rule.servingAreaId}:${rule.requirementId}`;

      if (!profile.confirmedRequirementKeys.has(key)) {
        return false;
      }
    }

    if (rule.requirementType === "availability") {
      if (
        !volunteerHasAvailabilityForRhythm(profile.availabilityKeys, rule.dayOfWeek ?? rhythmDayOfWeek)
      ) {
        return false;
      }
    }
  }

  return true;
}

export function volunteerPassesHardSchedulingFilters(
  profile: VolunteerSchedulingProfile,
  context: RequirementAssignContext
): boolean {
  if (!profile.interestsByServingAreaId.has(context.servingAreaId)) {
    return false;
  }

  if (!volunteerHasAvailabilityForRhythm(profile.availabilityKeys, context.rhythmDayOfWeek)) {
    return false;
  }

  if (isDateInBlackout(profile.blackoutRanges, context.occurrenceDate)) {
    return false;
  }

  if (context.assignedOnOccurrence) {
    return false;
  }

  if (
    !mandatoryRequirementsSatisfied(
      profile,
      context.servingAreaId,
      context.rhythmDayOfWeek,
      context.mandatoryRequirementsByServingArea
    )
  ) {
    return false;
  }

  const frequency = effectiveFrequencyForServingArea(
    profile,
    context.servingAreaId,
    profile.overallFrequency
  );

  const maxInSchedule = maxAssignmentsInScheduleForFrequency(
    frequency,
    context.scheduleStartDate,
    context.scheduleEndDate
  );

  if (context.assignmentsInSchedule >= maxInSchedule) {
    return false;
  }

  const maxPerMonth = maxAssignmentsPerMonthForFrequency(frequency);

  if (context.assignmentsInMonth >= maxPerMonth) {
    return false;
  }

  return true;
}

/** True if one more assignment would meet or exceed the volunteer's stated frequency caps. */
export function volunteerWouldExceedFrequencyLimits(
  profile: VolunteerSchedulingProfile,
  context: Pick<
    RequirementAssignContext,
    | "servingAreaId"
    | "scheduleStartDate"
    | "scheduleEndDate"
    | "assignmentsInSchedule"
    | "assignmentsInMonth"
  >
): boolean {
  const frequency = effectiveFrequencyForServingArea(
    profile,
    context.servingAreaId,
    profile.overallFrequency
  );

  const maxInSchedule = maxAssignmentsInScheduleForFrequency(
    frequency,
    context.scheduleStartDate,
    context.scheduleEndDate
  );

  if (context.assignmentsInSchedule >= maxInSchedule) {
    return true;
  }

  const maxPerMonth = maxAssignmentsPerMonthForFrequency(frequency);

  if (context.assignmentsInMonth >= maxPerMonth) {
    return true;
  }

  return false;
}

export function scoreVolunteerForRequirement(
  profile: VolunteerSchedulingProfile,
  context: RequirementAssignContext
): number {
  const interest = profile.interestsByServingAreaId.get(context.servingAreaId);
  const frequency = effectiveFrequencyForServingArea(
    profile,
    context.servingAreaId,
    profile.overallFrequency
  );

  let score = 0;

  score -= context.assignmentsInSchedule * 100;

  if (profile.lastServedDate) {
    const days = daysBetweenIso(profile.lastServedDate, context.occurrenceDate);
    score += Math.min(Math.max(days, 0), 400) * 0.4;
  } else {
    score += 60;
  }

  score += frequencyPreferenceScore(frequency);
  score += experiencePreferenceScore(interest?.experienceLevel ?? null);

  return score;
}

function daysBetweenIso(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T12:00:00`);
  const b = Date.parse(`${later}T12:00:00`);

  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }

  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

export { calendarMonthKey };
