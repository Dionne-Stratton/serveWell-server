/** Maps template rhythm `day_of_week` to volunteer availability keys (intake rules). */
export function availabilityKeyForRhythmDay(dayOfWeek: string | null): string | null {
  if (!dayOfWeek) {
    return null;
  }

  const availabilityByDay: Record<string, string> = {
    sunday: "sunday_morning",
    tuesday: "tuesday_night",
    wednesday: "wednesday_night"
  };

  return availabilityByDay[dayOfWeek] ?? null;
}

export function volunteerHasAvailabilityForRhythm(
  availabilityKeys: Set<string>,
  dayOfWeek: string | null
): boolean {
  const required = availabilityKeyForRhythmDay(dayOfWeek);

  if (!required) {
    return true;
  }

  return availabilityKeys.has(required) || availabilityKeys.has("special_events");
}
