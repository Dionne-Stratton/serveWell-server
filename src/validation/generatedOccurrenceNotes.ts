function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface OccurrenceNoteInput {
  note: string;
  scheduleServingAreaId: number | null;
}

export function validateOccurrenceNoteBody(body: unknown): OccurrenceNoteInput | string {
  if (!isRecord(body)) {
    return "Request body must be a JSON object.";
  }

  const rawNote = body.note;

  if (typeof rawNote !== "string" || !rawNote.trim()) {
    return "Note text is required.";
  }

  let scheduleServingAreaId: number | null = null;

  if (body.scheduleServingAreaId !== undefined && body.scheduleServingAreaId !== null) {
    const parsed = Number(body.scheduleServingAreaId);

    if (!Number.isInteger(parsed) || parsed < 1) {
      return "Serving area must be a valid id when provided.";
    }

    scheduleServingAreaId = parsed;
  }

  return {
    note: rawNote.trim(),
    scheduleServingAreaId
  };
}
