export interface OccurrenceStaffingRequirementInput {
  id?: number;
  scheduleServingAreaId: number;
  neededCount: number;
}

export function validateUpdateOccurrenceStaffingBody(
  body: unknown
):
  | { ok: true; value: OccurrenceStaffingRequirementInput[] }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  const record = body as Record<string, unknown>;

  if (!Array.isArray(record.requirements)) {
    return { ok: false, message: "Requirements must be an array." };
  }

  const requirements: OccurrenceStaffingRequirementInput[] = [];
  const seenServingAreaIds = new Set<number>();

  for (let index = 0; index < record.requirements.length; index += 1) {
    const item = record.requirements[index];

    if (!item || typeof item !== "object") {
      return { ok: false, message: `Requirement row ${index + 1} is invalid.` };
    }

    const row = item as Record<string, unknown>;
    const scheduleServingAreaId = Number(row.scheduleServingAreaId);

    if (!Number.isInteger(scheduleServingAreaId) || scheduleServingAreaId < 1) {
      return { ok: false, message: `Requirement row ${index + 1}: serving area is required.` };
    }

    if (seenServingAreaIds.has(scheduleServingAreaId)) {
      return { ok: false, message: "Each serving area can only appear once per event." };
    }

    seenServingAreaIds.add(scheduleServingAreaId);

    const neededCount = Number(row.neededCount);

    if (!Number.isInteger(neededCount) || neededCount < 1) {
      return {
        ok: false,
        message: `Requirement row ${index + 1}: needed count must be a whole number of at least 1.`
      };
    }

    let id: number | undefined;

    if (row.id !== undefined && row.id !== null && row.id !== "") {
      id = Number(row.id);

      if (!Number.isInteger(id) || id < 1) {
        return { ok: false, message: `Requirement row ${index + 1}: invalid requirement id.` };
      }
    }

    requirements.push({
      id,
      scheduleServingAreaId,
      neededCount
    });
  }

  return { ok: true, value: requirements };
}
