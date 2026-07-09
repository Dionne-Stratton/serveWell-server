import type { RecruitmentStatus } from "../lib/recruitmentStatus";

export interface ServingAreaRequirement {
  id: number;
  type: string;
  label: string;
  description: string | null;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  isMandatory: boolean;
  requiresConfirmation: boolean;
}

export interface ServingArea {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  publicNote: string | null;
  requiresBackgroundCheck: boolean;
  requiresTraining: boolean;
  requiresAuditionOrInterview: boolean;
  recruitmentStatus: RecruitmentStatus;
  requirements: ServingAreaRequirement[];
}
