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
