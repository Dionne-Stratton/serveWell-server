import { hashPassword } from "../auth/passwords";
import { provisionChurchVolunteerDefaultForm } from "./provisionDefaultForm";
import {
  validateOrganizationSlugFormat,
  type OrganizationRegistrationInput
} from "../validation/organizationRegistration";
import type { Env } from "../types";

export interface OrganizationProfile {
  id: number;
  slug: string;
  name: string;
  organizationType: string;
  contactEmail: string | null;
  websiteUrl: string | null;
}

export type CreateOrganizationResult =
  | { ok: true; organization: OrganizationProfile; adminId: number }
  | { ok: false; reason: "slug_taken" };

export async function isOrganizationSlugTaken(env: Env, slug: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `
    SELECT id
    FROM organizations
    WHERE slug = ?
    LIMIT 1
    `
  )
    .bind(slug)
    .first<{ id: number }>();

  return Boolean(row);
}

export type OrganizationSlugAvailability =
  | { available: true; slug: string }
  | {
      available: false;
      slug: string | null;
      reason: "invalid" | "reserved" | "taken";
      message: string;
    };

export async function getOrganizationSlugAvailability(
  env: Env,
  rawSlug: unknown
): Promise<OrganizationSlugAvailability> {
  const format = validateOrganizationSlugFormat(rawSlug);

  if (!format.ok) {
    return {
      available: false,
      slug: typeof rawSlug === "string" ? rawSlug.trim().toLowerCase() || null : null,
      reason: format.code === "ORGANIZATION_SLUG_RESERVED" ? "reserved" : "invalid",
      message: format.message
    };
  }

  if (await isOrganizationSlugTaken(env, format.slug)) {
    return {
      available: false,
      slug: format.slug,
      reason: "taken",
      message:
        "That URL slug is already taken. Try adding your city or neighborhood (for example, kairos-austin)."
    };
  }

  return { available: true, slug: format.slug };
}

export async function createOrganizationWithAdmin(
  env: Env,
  input: OrganizationRegistrationInput
): Promise<CreateOrganizationResult> {
  if (await isOrganizationSlugTaken(env, input.organizationSlug)) {
    return { ok: false, reason: "slug_taken" };
  }

  const passwordHash = await hashPassword(input.adminPassword);
  const contactEmail = input.contactEmail ?? input.adminEmail;

  const [organizationInsert, adminInsert] = await env.DB.batch([
    env.DB.prepare(
      `
      INSERT INTO organizations (
        slug,
        name,
        organization_type,
        contact_email,
        website_url,
        is_active
      ) VALUES (?, ?, ?, ?, ?, 1)
      `
    ).bind(
      input.organizationSlug,
      input.organizationName,
      input.organizationType,
      contactEmail,
      input.websiteUrl
    ),
    env.DB.prepare(
      `
      INSERT INTO admin_users (
        organization_id,
        email,
        password_hash,
        display_name,
        role,
        notify_admin_joined,
        is_active
      ) VALUES (last_insert_rowid(), ?, ?, ?, 'owner', 1, 1)
      `
    ).bind(input.adminEmail, passwordHash, input.adminDisplayName)
  ]);

  const organizationId = organizationInsert.meta.last_row_id;
  const adminId = adminInsert.meta.last_row_id;

  if (!adminId) {
    throw new Error("Admin user insert did not return an id.");
  }

  if (!organizationId) {
    throw new Error("Organization insert did not return an id.");
  }

  await provisionChurchVolunteerDefaultForm(env, organizationId);

  return {
    ok: true,
    organization: {
      id: organizationId,
      slug: input.organizationSlug,
      name: input.organizationName,
      organizationType: input.organizationType,
      contactEmail,
      websiteUrl: input.websiteUrl
    },
    adminId
  };
}

export function mapOrganizationProfile(organization: OrganizationProfile) {
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    organizationType: organization.organizationType,
    contactEmail: organization.contactEmail,
    websiteUrl: organization.websiteUrl
  };
}
