import type { Env } from "../types";
import {
  calendarMonthKey,
  scoreVolunteerForRequirement,
  volunteerPassesHardSchedulingFilters
} from "./volunteerSchedulingEligibility";
import {
  loadMandatoryServingAreaRequirements,
  loadVolunteerSchedulingProfiles
} from "./volunteerSchedulingProfiles";

export interface GeneratedScheduleAutoAssignAttentionItem {
  occurrenceId: number;
  occurrenceDate: string;
  occurrenceName: string;
  requirementId: number;
  servingAreaName: string;
  assignedCount: number;
  neededCount: number;
}

export interface GeneratedScheduleAutoAssignSummary {
  slotsNeeded: number;
  slotsFilled: number;
  slotsUnfilled: number;
  attentionItems: GeneratedScheduleAutoAssignAttentionItem[];
}

interface ScheduleRequirementRow {
  requirementId: number;
  occurrenceId: number;
  occurrenceDate: string;
  occurrenceName: string;
  rhythmDayOfWeek: string;
  scheduleServingAreaId: number | null;
  servingAreaId: number | null;
  servingAreaName: string;
  neededCount: number;
}

export async function autoAssignGeneratedSchedule(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<GeneratedScheduleAutoAssignSummary> {
  const schedule = await env.DB.prepare(
    `
    SELECT start_date, end_date
    FROM generated_schedules
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(generatedScheduleId, organizationId)
    .first<{ start_date: string; end_date: string }>();

  if (!schedule) {
    return emptySummary();
  }

  const requirements = await env.DB.prepare(
    `
    SELECT
      greq.id AS requirement_id,
      greq.occurrence_id,
      greq.needed_count,
      greq.schedule_serving_area_id,
      greq.display_name AS serving_area_name,
      gso.occurrence_date,
      gso.name AS occurrence_name,
      sr.day_of_week AS rhythm_day_of_week,
      ssa.serving_area_id
    FROM generated_schedule_occurrence_requirements greq
    INNER JOIN generated_schedule_occurrences gso ON gso.id = greq.occurrence_id
    INNER JOIN schedule_rhythms sr ON sr.id = gso.template_rhythm_id
    LEFT JOIN schedule_serving_areas ssa ON ssa.id = greq.schedule_serving_area_id
    WHERE gso.generated_schedule_id = ?
      AND greq.organization_id = ?
    ORDER BY gso.occurrence_date ASC, gso.sort_order ASC, gso.id ASC, greq.id ASC
    `
  )
    .bind(generatedScheduleId, organizationId)
    .all<{
      requirement_id: number;
      occurrence_id: number;
      needed_count: number;
      schedule_serving_area_id: number | null;
      serving_area_name: string;
      occurrence_date: string;
      occurrence_name: string;
      rhythm_day_of_week: string;
      serving_area_id: number | null;
    }>();

  const rows: ScheduleRequirementRow[] = (requirements.results ?? []).map((row) => ({
    requirementId: row.requirement_id,
    occurrenceId: row.occurrence_id,
    occurrenceDate: row.occurrence_date,
    occurrenceName: row.occurrence_name,
    rhythmDayOfWeek: row.rhythm_day_of_week,
    scheduleServingAreaId: row.schedule_serving_area_id,
    servingAreaId: row.serving_area_id,
    servingAreaName: row.serving_area_name,
    neededCount: row.needed_count
  }));

  const profiles = await loadVolunteerSchedulingProfiles(env, organizationId);
  const mandatoryRules = await loadMandatoryServingAreaRequirements(env, organizationId);
  const mandatoryByArea = new Map<number, typeof mandatoryRules>();

  for (const rule of mandatoryRules) {
    const list = mandatoryByArea.get(rule.servingAreaId) ?? [];
    list.push(rule);
    mandatoryByArea.set(rule.servingAreaId, list);
  }

  const assignmentsInSchedule = new Map<number, number>();
  const assignmentsInMonth = new Map<string, number>();
  const assignedOnOccurrence = new Map<number, Set<number>>();

  let slotsNeeded = 0;
  let slotsFilled = 0;
  const attentionItems: GeneratedScheduleAutoAssignAttentionItem[] = [];

  for (const row of rows) {
    slotsNeeded += row.neededCount;

    if (!row.servingAreaId || !row.scheduleServingAreaId) {
      attentionItems.push({
        occurrenceId: row.occurrenceId,
        occurrenceDate: row.occurrenceDate,
        occurrenceName: row.occurrenceName,
        requirementId: row.requirementId,
        servingAreaName: row.servingAreaName,
        assignedCount: 0,
        neededCount: row.neededCount
      });
      continue;
    }

    let assignedForRequirement = 0;

    for (let slot = 0; slot < row.neededCount; slot += 1) {
      const occurrenceSet =
        assignedOnOccurrence.get(row.occurrenceId) ?? new Set<number>();

      let bestId: number | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const profile of profiles.values()) {
        const monthKey = `${profile.submissionId}:${calendarMonthKey(row.occurrenceDate)}`;
        const context = {
          servingAreaId: row.servingAreaId,
          rhythmDayOfWeek: row.rhythmDayOfWeek,
          occurrenceDate: row.occurrenceDate,
          scheduleStartDate: schedule.start_date,
          scheduleEndDate: schedule.end_date,
          assignmentsInSchedule: assignmentsInSchedule.get(profile.submissionId) ?? 0,
          assignmentsInMonth: assignmentsInMonth.get(monthKey) ?? 0,
          assignedOnOccurrence: occurrenceSet.has(profile.submissionId),
          mandatoryRequirementsByServingArea: mandatoryByArea
        };

        if (!volunteerPassesHardSchedulingFilters(profile, context)) {
          continue;
        }

        const score = scoreVolunteerForRequirement(profile, context);

        if (
          score > bestScore ||
          (score === bestScore && (bestId === null || profile.submissionId < bestId))
        ) {
          bestScore = score;
          bestId = profile.submissionId;
        }
      }

      if (bestId == null) {
        continue;
      }

      await env.DB.prepare(
        `
        INSERT INTO generated_schedule_occurrence_assignments (
          organization_id,
          occurrence_id,
          requirement_id,
          submission_id
        )
        VALUES (?, ?, ?, ?)
        `
      )
        .bind(organizationId, row.occurrenceId, row.requirementId, bestId)
        .run();

      occurrenceSet.add(bestId);
      assignedOnOccurrence.set(row.occurrenceId, occurrenceSet);

      assignmentsInSchedule.set(bestId, (assignmentsInSchedule.get(bestId) ?? 0) + 1);
      const monthKey = `${bestId}:${calendarMonthKey(row.occurrenceDate)}`;
      assignmentsInMonth.set(monthKey, (assignmentsInMonth.get(monthKey) ?? 0) + 1);

      assignedForRequirement += 1;
      slotsFilled += 1;
    }

    await env.DB.prepare(
      `
      UPDATE generated_schedule_occurrence_requirements
      SET assigned_count = ?
      WHERE id = ?
      `
    )
      .bind(assignedForRequirement, row.requirementId)
      .run();

    if (assignedForRequirement < row.neededCount) {
      attentionItems.push({
        occurrenceId: row.occurrenceId,
        occurrenceDate: row.occurrenceDate,
        occurrenceName: row.occurrenceName,
        requirementId: row.requirementId,
        servingAreaName: row.servingAreaName,
        assignedCount: assignedForRequirement,
        neededCount: row.neededCount
      });
    }
  }

  return {
    slotsNeeded,
    slotsFilled,
    slotsUnfilled: Math.max(0, slotsNeeded - slotsFilled),
    attentionItems
  };
}

function emptySummary(): GeneratedScheduleAutoAssignSummary {
  return {
    slotsNeeded: 0,
    slotsFilled: 0,
    slotsUnfilled: 0,
    attentionItems: []
  };
}
