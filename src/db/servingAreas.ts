import type { Env } from "../types";
import type { RecruitmentStatus } from "../lib/recruitmentStatus";
import { buildPublicFormSections, flattenPublicSections } from "./publicFormSections";

interface ServingAreaRow {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  public_note: string | null;
  requires_background_check: number;
  requires_training: number;
  requires_audition_or_interview: number;
  requirement_id: number | null;
  requirement_type: string | null;
  requirement_label: string | null;
  requirement_description: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  is_mandatory: number | null;
  requires_confirmation: number | null;
}

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

export async function listServingAreasForForm(
  env: Env,
  organizationId: number,
  formId: number
): Promise<ServingArea[]> {
  const sections = await buildPublicFormSections(env, organizationId, formId);
  return flattenPublicSections(sections);
}
