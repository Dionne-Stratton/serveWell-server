const STATUS_LABELS: Record<string, string> = {
  new: "New / needs review",
  follow_up_needed: "Follow-up needed",
  requirements_pending: "Requirements pending",
  approved_ready_to_schedule: "Approved / ready to schedule",
  archived_inactive: "Archived / inactive",
  not_a_fit: "Not a fit"
};

export function submissionStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
