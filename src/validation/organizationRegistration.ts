export const ORGANIZATION_TYPES = ["church", "ministry", "other"] as const;

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number];

export const RESERVED_ORGANIZATION_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "demo",
  "login",
  "register",
  "signup",
  "servewell",
  "www"
]);

export interface OrganizationRegistrationInput {
  organizationName: string;
  organizationSlug: string;
  organizationType: OrganizationType;
  contactEmail: string | null;
  websiteUrl: string | null;
  adminEmail: string;
  adminPassword: string;
  adminDisplayName: string;
}

export type RegistrationValidationResult =
  | { ok: true; value: OrganizationRegistrationInput }
  | { ok: false; message: string; code: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateOrganizationRegistration(body: unknown): RegistrationValidationResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      message: "Request body must be a JSON object.",
      code: "INVALID_JSON"
    };
  }

  const organizationName = normalizeRequiredString(body.organizationName);
  const organizationSlug = normalizeSlug(body.organizationSlug);
  const organizationType = normalizeOrganizationType(body.organizationType);
  const contactEmail = normalizeOptionalEmail(body.contactEmail);
  const websiteUrl = normalizeOptionalUrl(body.websiteUrl);
  const adminEmail = normalizeRequiredString(body.adminEmail)?.toLowerCase() ?? null;
  const adminPassword = normalizeRequiredString(body.adminPassword);
  const adminDisplayName = normalizeRequiredString(body.adminDisplayName);

  if (!organizationName || organizationName.length > 120) {
    return {
      ok: false,
      message: "Organization name is required (120 characters or fewer).",
      code: "INVALID_ORGANIZATION_NAME"
    };
  }

  if (!organizationSlug) {
    return {
      ok: false,
      message:
        "Organization slug is required. Use lowercase letters, numbers, and hyphens (e.g. grace-church).",
      code: "INVALID_ORGANIZATION_SLUG"
    };
  }

  if (organizationSlug.length < 2 || organizationSlug.length > 48 || !SLUG_PATTERN.test(organizationSlug)) {
    return {
      ok: false,
      message:
        "Organization slug must be 2–48 characters and use only lowercase letters, numbers, and hyphens.",
      code: "INVALID_ORGANIZATION_SLUG"
    };
  }

  if (RESERVED_ORGANIZATION_SLUGS.has(organizationSlug)) {
    return {
      ok: false,
      message: "That organization URL is not available.",
      code: "ORGANIZATION_SLUG_RESERVED"
    };
  }

  if (!organizationType) {
    return {
      ok: false,
      message: "Organization type must be church, ministry, or other.",
      code: "INVALID_ORGANIZATION_TYPE"
    };
  }

  if (body.contactEmail !== undefined && body.contactEmail !== null && contactEmail === null) {
    return {
      ok: false,
      message: "Contact email must be a valid email address.",
      code: "INVALID_CONTACT_EMAIL"
    };
  }

  if (body.websiteUrl !== undefined && body.websiteUrl !== null && websiteUrl === null) {
    return {
      ok: false,
      message: "Website URL must be a valid http or https URL.",
      code: "INVALID_WEBSITE_URL"
    };
  }

  if (!adminEmail || !EMAIL_PATTERN.test(adminEmail)) {
    return {
      ok: false,
      message: "A valid admin email is required.",
      code: "INVALID_ADMIN_EMAIL"
    };
  }

  if (!adminPassword || adminPassword.length < 8) {
    return {
      ok: false,
      message: "Admin password must be at least 8 characters.",
      code: "INVALID_ADMIN_PASSWORD"
    };
  }

  if (!adminDisplayName || adminDisplayName.length > 80) {
    return {
      ok: false,
      message: "Admin display name is required (80 characters or fewer).",
      code: "INVALID_ADMIN_DISPLAY_NAME"
    };
  }

  return {
    ok: true,
    value: {
      organizationName,
      organizationSlug,
      organizationType,
      contactEmail,
      websiteUrl,
      adminEmail,
      adminPassword,
      adminDisplayName
    }
  };
}

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOrganizationType(value: unknown): OrganizationType | null {
  if (value === undefined || value === null || value === "") {
    return "church";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "church" || normalized === "ministry" || normalized === "other") {
    return normalized;
  }

  return null;
}

function normalizeOptionalEmail(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeOptionalUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeRequiredString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
