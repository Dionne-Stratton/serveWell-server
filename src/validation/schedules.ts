export const scheduleTypes = ["monthly", "special_event"] as const;

export const dayOfWeekValues = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const;

export type DayOfWeek = (typeof dayOfWeekValues)[number];

export type ScheduleType = (typeof scheduleTypes)[number];

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeStartTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();

  if (TIME_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);

  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === "PM" && hour < 12) {
    hour += 12;
  } else if (meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  if (hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export interface CreateScheduleServingAreaInput {
  servingAreaId: number | null;
  customName: string | null;
}

export interface CreateScheduleRequirementInput {
  servingAreaId: number | null;
  customName: string | null;
  neededCount: number;
}

export interface CreateScheduleRhythmInput {
  name: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  requirements: CreateScheduleRequirementInput[];
}

export interface CreateScheduleInput {
  name: string;
  scheduleType: ScheduleType;
  servingAreas: CreateScheduleServingAreaInput[];
  rhythms: CreateScheduleRhythmInput[];
}

export interface UpdateScheduleRhythmRequirementInput {
  scheduleServingAreaId: number;
  neededCount: number;
}

export interface UpdateScheduleRhythmInput {
  name: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  requirements: UpdateScheduleRhythmRequirementInput[];
}

export function validateScheduleNamePatch(
  body: unknown
): { name?: string; error?: string } {
  if (!isRecord(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const name = normalizeRequiredString(body.name);

  if (!name) {
    return { error: "Schedule name is required." };
  }

  return { name };
}

export function validateScheduleServingAreasUpdate(
  body: unknown
): { servingAreas?: CreateScheduleServingAreaInput[]; error?: string } {
  if (!isRecord(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const servingAreas = normalizeServingAreas(body.servingAreas);

  if (typeof servingAreas === "string") {
    return { error: servingAreas };
  }

  if (servingAreas.length === 0) {
    return { error: "Connect at least one serving area." };
  }

  return { servingAreas };
}

export function validateScheduleRhythmsUpdate(
  body: unknown,
  allowedScheduleServingAreaIds: Set<number>
): { rhythms?: UpdateScheduleRhythmInput[]; error?: string } {
  if (!isRecord(body)) {
    return { error: "Request body must be a JSON object." };
  }

  if (!Array.isArray(body.rhythms)) {
    return { error: "Rhythms must be a list." };
  }

  if (body.rhythms.length === 0) {
    return { error: "Add at least one service time." };
  }

  const rows: UpdateScheduleRhythmInput[] = [];

  for (const item of body.rhythms) {
    if (!isRecord(item)) {
      return { error: "Each rhythm must be an object." };
    }

    const rhythmName = normalizeRequiredString(item.name);

    if (!rhythmName) {
      return { error: "Each rhythm needs a name." };
    }

    const dayOfWeek = normalizeRequiredString(item.dayOfWeek);

    if (!dayOfWeek || !dayOfWeekValues.includes(dayOfWeek as DayOfWeek)) {
      return { error: "Each rhythm needs a valid day of week." };
    }

    const startTime = normalizeStartTime(item.startTime);

    if (!startTime) {
      return { error: "Each rhythm needs a valid start time (HH:MM)." };
    }

    const requirements = normalizeRhythmRequirementsById(
      item.requirements,
      allowedScheduleServingAreaIds
    );

    if (typeof requirements === "string") {
      return { error: requirements };
    }

    rows.push({
      name: rhythmName,
      dayOfWeek: dayOfWeek as DayOfWeek,
      startTime,
      requirements
    });
  }

  return { rhythms: rows };
}

function normalizeRhythmRequirementsById(
  value: unknown,
  allowedScheduleServingAreaIds: Set<number>
): UpdateScheduleRhythmRequirementInput[] | string {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return "Staffing requirements must be a list.";
  }

  const rows: UpdateScheduleRhythmRequirementInput[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return "Each staffing requirement must be an object.";
    }

    const scheduleServingAreaId = Number(item.scheduleServingAreaId);

    if (!Number.isInteger(scheduleServingAreaId) || scheduleServingAreaId < 1) {
      return "Each staffing row must use a connected serving area.";
    }

    if (!allowedScheduleServingAreaIds.has(scheduleServingAreaId)) {
      return "Each staffing row must use a serving area connected to this schedule.";
    }

    const neededCount = Number(item.neededCount);

    if (!Number.isInteger(neededCount) || neededCount < 1) {
      return "Needed count must be a whole number of at least 1.";
    }

    rows.push({ scheduleServingAreaId, neededCount });
  }

  return rows;
}

export function validateCreateScheduleBody(body: unknown): { input?: CreateScheduleInput; error?: string } {
  if (!isRecord(body)) {
    return { error: "Request body must be a JSON object." };
  }

  const name = normalizeRequiredString(body.name);

  if (!name) {
    return { error: "Schedule name is required." };
  }

  const scheduleType =
    typeof body.scheduleType === "string" && body.scheduleType.trim()
      ? body.scheduleType.trim()
      : "monthly";

  if (!scheduleTypes.includes(scheduleType as ScheduleType)) {
    return { error: "Schedule type must be monthly or special event." };
  }

  const servingAreas = normalizeServingAreas(body.servingAreas);

  if (typeof servingAreas === "string") {
    return { error: servingAreas };
  }

  if (servingAreas.length === 0) {
    return { error: "Connect at least one serving area." };
  }

  const rhythms = normalizeRhythms(body.rhythms, servingAreas);

  if (typeof rhythms === "string") {
    return { error: rhythms };
  }

  if (rhythms.length === 0) {
    return { error: "Add at least one service time." };
  }

  return {
    input: {
      name,
      scheduleType: scheduleType as ScheduleType,
      servingAreas,
      rhythms
    }
  };
}

function normalizeServingAreas(
  value: unknown
): CreateScheduleServingAreaInput[] | string {
  if (!Array.isArray(value)) {
    return "Serving areas must be a list.";
  }

  const rows: CreateScheduleServingAreaInput[] = [];
  const linkedIds = new Set<number>();
  const customNames = new Set<string>();

  for (const item of value) {
    if (!isRecord(item)) {
      return "Each serving area entry must be an object.";
    }

    const servingAreaId =
      typeof item.servingAreaId === "number" && Number.isInteger(item.servingAreaId)
        ? item.servingAreaId
        : null;
    const customName = normalizeOptionalString(item.customName);

    if (servingAreaId && customName) {
      return "Each serving area must be either linked or custom, not both.";
    }

    if (!servingAreaId && !customName) {
      continue;
    }

    if (servingAreaId) {
      if (linkedIds.has(servingAreaId)) {
        return "Duplicate serving area in schedule.";
      }

      linkedIds.add(servingAreaId);
      rows.push({ servingAreaId, customName: null });
      continue;
    }

    const key = customName!.toLowerCase();

    if (customNames.has(key)) {
      return "Duplicate custom serving area name.";
    }

    customNames.add(key);
    rows.push({ servingAreaId: null, customName });
  }

  return rows;
}

function normalizeRhythms(
  value: unknown,
  servingAreas: CreateScheduleServingAreaInput[]
): CreateScheduleRhythmInput[] | string {
  if (!Array.isArray(value)) {
    return "Rhythms must be a list.";
  }

  const allowedKeys = buildServingAreaKeys(servingAreas);
  const rows: CreateScheduleRhythmInput[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return "Each rhythm must be an object.";
    }

    const rhythmName = normalizeRequiredString(item.name);

    if (!rhythmName) {
      return "Each rhythm needs a name.";
    }

    const dayOfWeek = normalizeRequiredString(item.dayOfWeek);

    if (!dayOfWeek || !dayOfWeekValues.includes(dayOfWeek as DayOfWeek)) {
      return "Each rhythm needs a valid day of week.";
    }

    const startTime = normalizeStartTime(item.startTime);

    if (!startTime) {
      return "Each rhythm needs a valid start time (HH:MM).";
    }

    const requirements = normalizeRequirements(item.requirements, allowedKeys);

    if (typeof requirements === "string") {
      return requirements;
    }

    rows.push({
      name: rhythmName,
      dayOfWeek: dayOfWeek as DayOfWeek,
      startTime,
      requirements
    });
  }

  return rows;
}

function normalizeRequirements(
  value: unknown,
  allowedKeys: Set<string>
): CreateScheduleRequirementInput[] | string {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return "Staffing requirements must be a list.";
  }

  const rows: CreateScheduleRequirementInput[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return "Each staffing requirement must be an object.";
    }

    const servingAreaId =
      typeof item.servingAreaId === "number" && Number.isInteger(item.servingAreaId)
        ? item.servingAreaId
        : null;
    const customName = normalizeOptionalString(item.customName);
    const key = servingAreaKey(servingAreaId, customName);

    if (!key || !allowedKeys.has(key)) {
      return "Each staffing row must use a serving area connected to this schedule.";
    }

    const neededCount = Number(item.neededCount);

    if (!Number.isInteger(neededCount) || neededCount < 1) {
      return "Needed count must be a whole number of at least 1.";
    }

    rows.push({
      servingAreaId,
      customName,
      neededCount
    });
  }

  return rows;
}

function buildServingAreaKeys(servingAreas: CreateScheduleServingAreaInput[]): Set<string> {
  const keys = new Set<string>();

  for (const row of servingAreas) {
    const key = servingAreaKey(row.servingAreaId, row.customName);

    if (key) {
      keys.add(key);
    }
  }

  return keys;
}

export function servingAreaKey(
  servingAreaId: number | null,
  customName: string | null
): string | null {
  if (servingAreaId) {
    return `id:${servingAreaId}`;
  }

  if (customName) {
    return `custom:${customName.toLowerCase()}`;
  }

  return null;
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
