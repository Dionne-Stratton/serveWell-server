export const recruitmentStatuses = ["open", "needed", "urgent", "closed"] as const;

export type RecruitmentStatus = (typeof recruitmentStatuses)[number];

export function isRecruitmentStatus(value: unknown): value is RecruitmentStatus {
  return typeof value === "string" && recruitmentStatuses.includes(value as RecruitmentStatus);
}

export function recruitmentStatusToIsActive(status: RecruitmentStatus): boolean {
  return status !== "closed";
}

export function normalizeRecruitmentStatus(
  recruitmentStatus: string | null | undefined,
  isActive: boolean
): RecruitmentStatus {
  if (isRecruitmentStatus(recruitmentStatus)) {
    return recruitmentStatus;
  }
  return isActive ? "open" : "closed";
}
