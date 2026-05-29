import { hashPassword } from "../auth/passwords";
import { provisionChurchVolunteerDefaultForm } from "./provisionDefaultForm";
import type { OrganizationRegistrationInput } from "../validation/organizationRegistration";
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
  | { ok: false; reason: "slug_taken" | "email_taken" };

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

export async function isAdminEmailTaken(env: Env, email: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `
    SELECT id
    FROM admin_users
    WHERE lower(email) = lower(?)
    LIMIT 1
    `
  )
    .bind(email)
    .first<{ id: number }>();

  return Boolean(row);
}

export async function createOrganizationWithAdmin(
  env: Env,
  input: OrganizationRegistrationInput
): Promise<CreateOrganizationResult> {
  if (await isOrganizationSlugTaken(env, input.organizationSlug)) {
    return { ok: false, reason: "slug_taken" };
  }

  if (await isAdminEmailTaken(env, input.adminEmail)) {
    return { ok: false, reason: "email_taken" };
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
        is_active
      ) VALUES (last_insert_rowid(), ?, ?, ?, 'admin', 1)
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
