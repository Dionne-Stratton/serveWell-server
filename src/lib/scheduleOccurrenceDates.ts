const DAY_OF_WEEK_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function compareIsoDates(a: string, b: string): number {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

/** UTC calendar date as YYYY-MM-DD (matches stored occurrence dates). */
export function todayIsoDateUtc(): string {
  const date = new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function validateGeneratedScheduleRangeDates(
  startDate: string,
  endDate: string
): string | null {
  if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate)) {
    return "Dates must use YYYY-MM-DD format.";
  }

  if (compareIsoDates(endDate, startDate) < 0) {
    return "End date cannot be before start date.";
  }

  const today = todayIsoDateUtc();

  if (compareIsoDates(startDate, today) < 0) {
    return "Start date cannot be in the past.";
  }

  if (compareIsoDates(endDate, today) < 0) {
    return "End date cannot be in the past.";
  }

  return null;
}

/** Monthly templates: reject months that have already ended. */
export function validateMonthlyScheduleMonthYear(year: number, month: number): string | null {
  const bounds = monthBounds(year, month);
  const today = todayIsoDateUtc();

  if (compareIsoDates(bounds.endDate, today) < 0) {
    return "That month is entirely in the past.";
  }

  return null;
}

export function monthBounds(year: number, month: number): { startDate: string; endDate: string } {
  const startDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

export function listOccurrenceDatesForDayOfWeek(
  startDate: string,
  endDate: string,
  dayOfWeek: string
): string[] {
  const target = DAY_OF_WEEK_TO_INDEX[dayOfWeek.toLowerCase()];

  if (target === undefined) {
    return [];
  }

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  let current = Date.UTC(startYear, startMonth - 1, startDay);
  const endMs = Date.UTC(endYear, endMonth - 1, endDay);
  const dates: string[] = [];

  while (current <= endMs) {
    const date = new Date(current);

    if (date.getUTCDay() === target) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }

    current += 24 * 60 * 60 * 1000;
  }

  return dates;
}
