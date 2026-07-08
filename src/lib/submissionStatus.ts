const LEGACY_REQUIREMENTS_PENDING = [
  "background_check_needed",
  "background_check_pending",
  "training_needed",
] as const;

export const REQUIREMENTS_PENDING_STATUS = "requirements_pending";

const LEGACY_ADDED_TO_PLANNING_CENTER = "added_to_planning_center";

export function normalizeSubmissionStatus(status: string): string {
  if ((LEGACY_REQUIREMENTS_PENDING as readonly string[]).includes(status)) {
    return REQUIREMENTS_PENDING_STATUS;
  }

  if (status === LEGACY_ADDED_TO_PLANNING_CENTER) {
    return "approved_ready_to_schedule";
  }

  return status;
}

export function isLegacyRequirementsPendingStatus(status: string): boolean {
  return (LEGACY_REQUIREMENTS_PENDING as readonly string[]).includes(status);
}

export function requirementsPendingStatusFilterValues(): string[] {
  return [REQUIREMENTS_PENDING_STATUS, ...LEGACY_REQUIREMENTS_PENDING];
}

/** Raw `volunteer_submissions.status` values that may be assigned on generated schedules. */
export const SCHEDULING_READY_STATUS_DB_VALUES = [
  "approved_ready_to_schedule",
  LEGACY_ADDED_TO_PLANNING_CENTER
] as const;

export function isSchedulingReadySubmissionStatus(status: string): boolean {
  return normalizeSubmissionStatus(status) === "approved_ready_to_schedule";
}

export function schedulingReadyStatusSqlInList(): string {
  return SCHEDULING_READY_STATUS_DB_VALUES.map((value) => `'${value}'`).join(", ");
}
