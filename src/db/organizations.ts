import type { Env } from "../types";

interface OrganizationRow {
  id: number;
  slug: string;
  name: string;
  organization_type: string;
  website_url: string | null;
}

interface VolunteerFormRow {
  id: number;
  organization_id: number;
  slug: string;
  name: string;
  description: string | null;
  intro_text: string | null;
  success_message: string | null;
  template_key: string;
  is_default: number;
  is_active: number;
}

export interface Organization {
  id: number;
  slug: string;
  name: string;
  organizationType: string;
  websiteUrl: string | null;
}

export interface VolunteerForm {
  id: number;
  organizationId: number;
  slug: string;
  name: string;
  description: string | null;
  introText: string | null;
  successMessage: string | null;
  templateKey: string;
  isDefault: boolean;
  isActive: boolean;
}

export async function findActiveOrganizationById(
  env: Env,
  id: number
): Promise<Organization | null> {
  const row = await env.DB.prepare(
    `
    SELECT id, slug, name, organization_type, website_url
    FROM organizations
    WHERE id = ? AND is_active = 1
  `
  )
    .bind(id)
    .first<OrganizationRow>();

  return row ? mapOrganization(row) : null;
}

export async function findActiveOrganizationBySlug(
  env: Env,
  slug: string
): Promise<Organization | null> {
  const row = await env.DB.prepare(
    `
    SELECT id, slug, name, organization_type, website_url
    FROM organizations
    WHERE slug = ? AND is_active = 1
  `
  )
    .bind(slug)
    .first<OrganizationRow>();

  return row ? mapOrganization(row) : null;
}

export async function findVolunteerFormBySlug(
  env: Env,
  organizationId: number,
  formSlug: string
): Promise<VolunteerForm | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      slug,
      name,
      description,
      intro_text,
      success_message,
      template_key,
      is_default,
      is_active
    FROM volunteer_forms
    WHERE organization_id = ? AND slug = ?
  `
  )
    .bind(organizationId, formSlug)
    .first<VolunteerFormRow>();

  return row ? mapVolunteerForm(row) : null;
}

export async function findActiveVolunteerFormBySlug(
  env: Env,
  organizationId: number,
  formSlug: string
): Promise<VolunteerForm | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      slug,
      name,
      description,
      intro_text,
      success_message,
      template_key,
      is_default,
      is_active
    FROM volunteer_forms
    WHERE organization_id = ? AND slug = ? AND is_active = 1
  `
  )
    .bind(organizationId, formSlug)
    .first<VolunteerFormRow>();

  return row ? mapVolunteerForm(row) : null;
}

export async function findDefaultActiveVolunteerForm(
  env: Env,
  organizationId: number
): Promise<VolunteerForm | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      slug,
      name,
      description,
      intro_text,
      success_message,
      template_key,
      is_default,
      is_active
    FROM volunteer_forms
    WHERE organization_id = ? AND is_default = 1 AND is_active = 1
    ORDER BY id ASC
    LIMIT 1
  `
  )
    .bind(organizationId)
    .first<VolunteerFormRow>();

  return row ? mapVolunteerForm(row) : null;
}

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    organizationType: row.organization_type,
    websiteUrl: row.website_url
  };
}

function mapVolunteerForm(row: VolunteerFormRow): VolunteerForm {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    introText: row.intro_text,
    successMessage: row.success_message,
    templateKey: row.template_key,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active)
  };
}

export function mapPublicOrganization(organization: Organization) {
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name
  };
}

export function mapPublicForm(form: VolunteerForm) {
  return {
    id: form.id,
    slug: form.slug,
    name: form.name,
    description: form.description,
    introText: form.introText,
    successMessage: form.successMessage,
    isActive: form.isActive
  };
}
