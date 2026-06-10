export interface BlackoutDateInput {
  startDate: string;
  endDate: string;
  note: string | null;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeBlackoutDates(value: unknown): BlackoutDateInput[] | string {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return "Blackout dates must be a list.";
  }

  const rows: BlackoutDateInput[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return "Each blackout date must be an object.";
    }

    const startDate = normalizeDateString(item.startDate);

    if (!startDate) {
      const hasOtherFields =
        normalizeOptionalString(item.endDate) || normalizeOptionalString(item.note);

      if (hasOtherFields) {
        return "Each blackout date range needs a start date.";
      }

      continue;
    }

    if (!ISO_DATE_PATTERN.test(startDate) || !isValidCalendarDate(startDate)) {
      return "Blackout start date must be a valid date (YYYY-MM-DD).";
    }

    let endDate = normalizeDateString(item.endDate) ?? startDate;

    if (!ISO_DATE_PATTERN.test(endDate) || !isValidCalendarDate(endDate)) {
      return "Blackout end date must be a valid date (YYYY-MM-DD).";
    }

    if (endDate < startDate) {
      return "Blackout end date cannot be before the start date.";
    }

    rows.push({
      startDate,
      endDate,
      note: normalizeOptionalString(item.note)
    });
  }

  return rows;
}

function normalizeDateString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isValidCalendarDate(isoDate: string): boolean {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
