export const preferredContactMethods = ["email", "text", "phone", "no_preference"] as const;

export const frequencyOptions = [
  "every_week",
  "two_to_three_times_month",
  "twice_month",
  "once_month",
  "occasionally",
  "flexible"
] as const;

export const availabilityKeys = [
  "sunday_morning",
  "tuesday_night",
  "wednesday_night",
  "special_events",
  "other"
] as const;

export const experienceLevels = ["none", "some", "experienced", "not_sure"] as const;

export function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}
