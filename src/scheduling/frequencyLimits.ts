import type { FrequencyOption } from "./volunteerSchedulingProfiles";

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function calendarMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function countCalendarMonthsInRange(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

  return Math.max(1, months);
}

/** Max total assignments this volunteer may take in one generated schedule. */
export function maxAssignmentsInScheduleForFrequency(
  frequency: FrequencyOption,
  startDate: string,
  endDate: string
): number {
  const months = countCalendarMonthsInRange(startDate, endDate);

  switch (frequency) {
    case "every_week":
      return months * 5;
    case "two_to_three_times_month":
      return months * 3;
    case "twice_month":
      return months * 2;
    case "once_month":
      return months;
    case "occasionally":
      return Math.max(1, Math.ceil(months / 2));
    case "flexible":
      return months * 3;
    case "not_sure":
      return months * 2;
    default:
      return months * 2;
  }
}

/** Hard cap per calendar month within the schedule. */
export function maxAssignmentsPerMonthForFrequency(frequency: FrequencyOption): number {
  switch (frequency) {
    case "every_week":
      return 5;
    case "two_to_three_times_month":
      return 3;
    case "twice_month":
      return 2;
    case "once_month":
      return 1;
    case "occasionally":
      return 1;
    case "flexible":
      return 3;
    case "not_sure":
      return 2;
    default:
      return 2;
  }
}

export function frequencyPreferenceScore(frequency: FrequencyOption): number {
  switch (frequency) {
    case "every_week":
      return 40;
    case "twice_month":
    case "two_to_three_times_month":
      return 30;
    case "flexible":
      return 25;
    case "once_month":
      return 20;
    case "not_sure":
      return 15;
    case "occasionally":
      return 10;
    default:
      return 12;
  }
}
