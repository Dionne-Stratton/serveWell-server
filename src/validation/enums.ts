export const preferredContactMethods = ["email", "text", "phone", "no_preference"] as const;

/** Preferred contact choices that require a phone number on the submission. */
export const phoneRequiredPreferredContactMethods = ["text", "phone"] as const;

export const frequencyOptions = [
  "every_week",
  "two_to_three_times_month",
  "twice_month",
  "once_month",
  "occasionally",
  "flexible",
  "not_sure"
] as const;

export const availabilityKeys = [
  "sunday_morning",
  "tuesday_night",
  "wednesday_night",
  "special_events",
  "other"
] as const;

export const experienceLevels = ["none", "some", "experienced", "not_sure"] as const;

export const submissionStatuses = [
  "new",
  "follow_up_needed",
  "contacted",
  "requirements_pending",
  "approved_ready_to_schedule",
  "archived_inactive",
  "not_a_fit"
] as const;

export function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}
