import type { AssignmentRemovalSnapshot, OccurrenceEmailMeta, PriorScheduleAssignment } from "../db/generatedScheduleUpdateNotify";
import type { ScheduleContentScopeChange } from "./scheduleVolunteerUpdateTypes";

export type SchedulePendingVolunteerUpdatePayload =
  | {
      kind: "assignment_added";
      occurrenceId: number;
      requirementId: number;
      movedFrom: PriorScheduleAssignment | null;
    }
  | {
      kind: "assignment_removed";
      removed: AssignmentRemovalSnapshot;
    }
  | {
      kind: "content";
      occurrence: OccurrenceEmailMeta;
      scopeChanges: ScheduleContentScopeChange[];
    };

export function parseSchedulePendingVolunteerUpdatePayload(
  raw: string
): SchedulePendingVolunteerUpdatePayload | null {
  try {
    const value = JSON.parse(raw) as SchedulePendingVolunteerUpdatePayload;

    if (!value || typeof value !== "object" || !("kind" in value)) {
      return null;
    }

    if (value.kind === "assignment_added") {
      if (
        !Number.isInteger(value.occurrenceId) ||
        !Number.isInteger(value.requirementId)
      ) {
        return null;
      }

      return value;
    }

    if (value.kind === "assignment_removed") {
      if (!value.removed?.submissionId) {
        return null;
      }

      return value;
    }

    if (value.kind === "content") {
      if (!value.occurrence?.occurrenceId || !Array.isArray(value.scopeChanges)) {
        return null;
      }

      return value;
    }

    return null;
  } catch {
    return null;
  }
}

export function serializeSchedulePendingVolunteerUpdatePayload(
  payload: SchedulePendingVolunteerUpdatePayload
): string {
  return JSON.stringify(payload);
}
