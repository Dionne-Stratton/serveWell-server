export type ScheduleContentChangeAction = "added" | "updated" | "removed";

export interface ScheduleContentScope {
  scheduleServingAreaId: number | null;
  servingAreaDisplayName: string | null;
}

export interface ScheduleContentScopeChange {
  scope: ScheduleContentScope;
  noteChanges: { action: ScheduleContentChangeAction; text: string }[];
  resourceChanges: {
    action: ScheduleContentChangeAction;
    resourceId?: number;
    label: string;
  }[];
}
