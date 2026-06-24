function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface OccurrenceResourceUploadFile {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  name: string;
  type: string;
}

export function isOccurrenceResourceUploadFile(
  value: unknown
): value is OccurrenceResourceUploadFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof (value as OccurrenceResourceUploadFile).arrayBuffer === "function" &&
    "size" in value &&
    typeof (value as OccurrenceResourceUploadFile).size === "number"
  );
}

export interface OccurrenceResourceMetadataInput {
  displayName: string | null;
  scheduleServingAreaId: number | null;
}

export function validateOccurrenceResourceMetadataBody(
  body: unknown
): OccurrenceResourceMetadataInput | string {
  if (!isRecord(body)) {
    return "Request body must be a JSON object.";
  }

  let displayName: string | null = null;

  if (body.displayName !== undefined && body.displayName !== null) {
    if (typeof body.displayName !== "string") {
      return "Display name must be text.";
    }

    const trimmed = body.displayName.trim();
    displayName = trimmed.length > 0 ? trimmed : null;
  }

  let scheduleServingAreaId: number | null = null;

  if (body.scheduleServingAreaId !== undefined && body.scheduleServingAreaId !== null) {
    const parsed = Number(body.scheduleServingAreaId);

    if (!Number.isInteger(parsed) || parsed < 1) {
      return "Serving area must be a valid id when provided.";
    }

    scheduleServingAreaId = parsed;
  }

  return { displayName, scheduleServingAreaId };
}

export function parseOptionalScheduleServingAreaIdFromForm(
  value: unknown
): number | null | string {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return "Serving area must be a valid id when provided.";
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return "Serving area must be a valid id when provided.";
  }

  return parsed;
}

export function parseOptionalDisplayNameFromForm(value: unknown): string | null {
  if (value === null || typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
