const frequencyLabels: Record<string, string> = {
  every_week: "Every week",
  two_to_three_times_month: "2–3 times per month",
  twice_month: "Twice per month",
  once_month: "Once per month",
  occasionally: "Occasionally",
  flexible: "Flexible / as needed"
};

const availabilityLabels: Record<string, string> = {
  sunday_morning: "Sunday morning",
  tuesday_night: "Tuesday night",
  wednesday_night: "Wednesday night",
  special_events: "Special events",
  other: "Other"
};

const experienceLabels: Record<string, string> = {
  none: "No experience yet",
  some: "Some experience",
  experienced: "Experienced",
  not_sure: "Not sure"
};

export function labelOverallFrequency(value: string): string {
  return frequencyLabels[value] ?? value;
}

export function labelAvailabilityKey(value: string): string {
  return availabilityLabels[value] ?? value;
}

export function labelExperienceLevel(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return experienceLabels[value] ?? value;
}
