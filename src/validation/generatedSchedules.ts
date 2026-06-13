import {
  monthBounds,
  validateGeneratedScheduleRangeDates,
  validateMonthlyScheduleMonthYear
} from "../lib/scheduleOccurrenceDates";
import type { ScheduleType } from "./schedules";

export interface CreateGeneratedScheduleInput {
  scheduleTemplateId: number;
  month?: number;
  year?: number;
  startDate?: string;
  endDate?: string;
}

export interface ValidatedGeneratedScheduleRange {
  scheduleTemplateId: number;
  name: string;
  startDate: string;
  endDate: string;
}

function normalizeScheduleName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateCreateGeneratedScheduleBody(
  body: unknown
):
  | { ok: true; value: ValidatedGeneratedScheduleRange }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  const record = body as Record<string, unknown>;
  const name = normalizeScheduleName(record.name);

  if (!name) {
    return { ok: false, message: "Schedule name is required." };
  }

  const scheduleTemplateId = Number(record.scheduleTemplateId);

  if (!Number.isInteger(scheduleTemplateId) || scheduleTemplateId < 1) {
    return { ok: false, message: "A schedule template is required." };
  }

  const hasMonth = record.month !== undefined && record.month !== null;
  const hasYear = record.year !== undefined && record.year !== null;
  const hasStart = typeof record.startDate === "string" && record.startDate.trim();
  const hasEnd = typeof record.endDate === "string" && record.endDate.trim();

  if (hasMonth || hasYear) {
    const month = Number(record.month);
    const year = Number(record.year);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { ok: false, message: "Month is required (1–12)." };
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, message: "Year is required." };
    }

    const bounds = monthBounds(year, month);
    const monthError = validateMonthlyScheduleMonthYear(year, month);

    if (monthError) {
      return { ok: false, message: monthError };
    }

    return {
      ok: true,
      value: {
        scheduleTemplateId,
        name,
        startDate: bounds.startDate,
        endDate: bounds.endDate
      }
    };
  }

  if (!hasStart || !hasEnd) {
    return { ok: false, message: "Start and end dates are required." };
  }

  const startDate = String(record.startDate).trim();
  const endDate = String(record.endDate).trim();

  const rangeError = validateGeneratedScheduleRangeDates(startDate, endDate);

  if (rangeError) {
    return { ok: false, message: rangeError };
  }

  return {
    ok: true,
    value: {
      scheduleTemplateId,
      name,
      startDate,
      endDate
    }
  };
}

export function validateRangeForTemplateType(
  scheduleType: ScheduleType,
  range: ValidatedGeneratedScheduleRange,
  usedMonthYear: boolean
): string | null {
  if (scheduleType === "monthly") {
    if (!usedMonthYear) {
      return "Monthly templates require selecting a month and year.";
    }

    return null;
  }

  if (scheduleType === "special_event") {
    if (usedMonthYear) {
      return "Special event templates require a start and end date.";
    }

    return null;
  }

  return "Unsupported schedule template type.";
}
