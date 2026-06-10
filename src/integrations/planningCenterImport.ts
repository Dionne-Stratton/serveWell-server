import {
  createPlanningCenterImportSubmission,
  findSubmissionByPlanningCenterPersonAndTab,
  type PlanningCenterImportCustomField
} from "../db/planningCenterImportSubmissions";
import { getPlanningCenterAccessToken } from "./planningCenterAccess";
import {
  listAllPeopleResources,
  planningCenterPeopleRequest,
  type JsonApiListResponse,
  type JsonApiResource,
  type JsonApiSingleResponse
} from "./planningCenterPeopleApi";
import type { Env } from "../types";

export class PlanningCenterImportError extends Error {
  code: string;
  status: number;
  submissionId?: number;

  constructor(message: string, code: string, status: number, submissionId?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.submissionId = submissionId;
  }
}

export interface PlanningCenterPersonSearchResult {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export interface PlanningCenterPeopleTabOption {
  id: string;
  name: string;
}

export interface PlanningCenterImportPreview {
  personId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  tabId: string;
  tabName: string;
  customFields: PlanningCenterImportCustomField[];
}

export async function searchPlanningCenterPeople(
  env: Env,
  organizationId: number,
  search: string
): Promise<PlanningCenterPersonSearchResult[]> {
  const accessToken = await requireAccessToken(env, organizationId);
  const query = search.trim();

  if (query.length < 2) {
    return [];
  }

  const people = await planningCenterPeopleRequest<JsonApiListResponse<{
    first_name: string;
    last_name: string;
  }>>(
    accessToken,
    `/people?where[search_name_or_email]=${encodeURIComponent(query)}&per_page=25`
  );

  const results: PlanningCenterPersonSearchResult[] = [];

  for (const person of people.data ?? []) {
    const contact = await fetchPersonPrimaryContact(accessToken, person.id);
    results.push({
      id: person.id,
      firstName: person.attributes.first_name?.trim() ?? "",
      lastName: person.attributes.last_name?.trim() ?? "",
      displayName: formatPersonDisplayName(
        person.attributes.first_name,
        person.attributes.last_name
      ),
      email: contact.email,
      phone: contact.phone
    });
  }

  return results;
}

export async function listPlanningCenterPeopleTabs(
  env: Env,
  organizationId: number
): Promise<PlanningCenterPeopleTabOption[]> {
  const accessToken = await requireAccessToken(env, organizationId);
  const tabs = await listAllPeopleResources<{ name: string }>(accessToken, "/tabs");

  return tabs
    .map((tab) => ({
      id: tab.id,
      name: tab.attributes.name?.trim() || `Tab ${tab.id}`
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function buildPlanningCenterImportPreview(
  env: Env,
  organizationId: number,
  input: {
    personId: string;
    tabId: string;
  }
): Promise<PlanningCenterImportPreview> {
  const accessToken = await requireAccessToken(env, organizationId);
  const personId = input.personId.trim();
  const tabId = input.tabId.trim();

  if (!personId) {
    throw new PlanningCenterImportError("A Planning Center person is required.", "VALIDATION_ERROR", 400);
  }

  if (!tabId) {
    throw new PlanningCenterImportError(
      "Choose a Planning Center tab to import.",
      "VALIDATION_ERROR",
      400
    );
  }

  const person = await planningCenterPeopleRequest<
    JsonApiSingleResponse<{ first_name: string; last_name: string }>
  >(accessToken, `/people/${personId}`);

  const contact = await fetchPersonPrimaryContact(accessToken, personId);
  assertHasContact(contact.email, contact.phone);

  const tab = await planningCenterPeopleRequest<JsonApiSingleResponse<{ name: string }>>(
    accessToken,
    `/tabs/${tabId}`
  );

  const tabName = tab.data.attributes.name?.trim() || `Tab ${tabId}`;
  const customFields = await fetchPersonCustomTabFields(accessToken, personId, tabId);

  return {
    personId,
    firstName: person.data.attributes.first_name?.trim() ?? "",
    lastName: person.data.attributes.last_name?.trim() ?? "",
    email: contact.email,
    phone: contact.phone,
    tabId,
    tabName,
    customFields
  };
}

export async function executePlanningCenterImport(
  env: Env,
  organizationId: number,
  adminUserId: number,
  input: {
    personId: string;
    tabId: string;
  }
): Promise<{ submissionId: number }> {
  const preview = await buildPlanningCenterImportPreview(env, organizationId, input);

  const existing = await findSubmissionByPlanningCenterPersonAndTab(
    env,
    organizationId,
    preview.personId,
    preview.tabId
  );

  if (existing) {
    throw new PlanningCenterImportError(
      "This Planning Center person is already imported from the selected tab.",
      "ALREADY_IMPORTED",
      409,
      existing.id
    );
  }

  const preferredContactMethod = preview.email ? "email" : "text";
  const importedAt = new Date().toISOString();

  const submissionId = await createPlanningCenterImportSubmission(env, {
    organizationId,
    firstName: preview.firstName || "Unknown",
    lastName: preview.lastName || "",
    email: preview.email,
    phone: preview.phone,
    preferredContactMethod,
    planningCenterPersonId: preview.personId,
    importedByAdminUserId: adminUserId,
    importedAt,
    importTabId: preview.tabId,
    importTabName: preview.tabName,
    importCustomDataJson: JSON.stringify(preview.customFields)
  });

  return { submissionId };
}

async function requireAccessToken(env: Env, organizationId: number): Promise<string> {
  const accessToken = await getPlanningCenterAccessToken(env, organizationId);

  if (!accessToken) {
    throw new PlanningCenterImportError(
      "Planning Center is not connected or the access token has expired. Reconnect from the dashboard and try again.",
      "INTEGRATION_NOT_CONNECTED",
      400
    );
  }

  return accessToken;
}

async function fetchPersonPrimaryContact(
  accessToken: string,
  personId: string
): Promise<{ email: string | null; phone: string | null }> {
  const [emails, phones] = await Promise.all([
    listAllPeopleResources<{ address: string; primary: boolean }>(
      accessToken,
      `/people/${personId}/emails`
    ),
    listAllPeopleResources<{ number: string; primary: boolean }>(
      accessToken,
      `/people/${personId}/phone_numbers`
    )
  ]);

  const primaryEmail =
    emails.find((row) => row.attributes.primary)?.attributes.address?.trim() ??
    emails[0]?.attributes.address?.trim() ??
    null;

  const primaryPhone =
    phones.find((row) => row.attributes.primary)?.attributes.number?.trim() ??
    phones[0]?.attributes.number?.trim() ??
    null;

  return {
    email: primaryEmail || null,
    phone: primaryPhone || null
  };
}

/** Every field on the tab, with values from the person (empty string when unset). */
async function fetchPersonCustomTabFields(
  accessToken: string,
  personId: string,
  tabId: string
): Promise<PlanningCenterImportCustomField[]> {
  const definitions = await listAllPeopleResources<{ name: string; sequence?: number }>(
    accessToken,
    `/tabs/${tabId}/field_definitions`
  );

  if (definitions.length === 0) {
    return [];
  }

  const fieldData = await listAllPeopleResources<{ value: string }>(
    accessToken,
    `/people/${personId}/field_data`
  );

  const valueByDefinitionId = new Map<string, string>();

  for (const row of fieldData) {
    const fieldDefinitionId = resolveFieldDefinitionId(row);

    if (!fieldDefinitionId) {
      continue;
    }

    valueByDefinitionId.set(fieldDefinitionId, row.attributes.value ?? "");
  }

  const fields = definitions.map((definition) => ({
    fieldDefinitionId: definition.id,
    name: definition.attributes.name?.trim() || `Field ${definition.id}`,
    value: valueByDefinitionId.get(definition.id)?.trim() ?? ""
  }));

  fields.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return fields;
}

function resolveFieldDefinitionId(
  row: JsonApiResource<{ value: string; field_definition_id?: string }>
): string | null {
  const related = row.relationships?.field_definition?.data;

  if (related && typeof related === "object" && "id" in related && !Array.isArray(related)) {
    return related.id;
  }

  const attributeId = row.attributes.field_definition_id;

  return typeof attributeId === "string" && attributeId.trim() ? attributeId.trim() : null;
}

function assertHasContact(email: string | null, phone: string | null): void {
  if (!email?.trim() && !phone?.trim()) {
    throw new PlanningCenterImportError(
      "This person needs an email address or phone number in Planning Center before they can be imported.",
      "MISSING_CONTACT",
      400
    );
  }
}

function formatPersonDisplayName(firstName: string, lastName: string): string {
  return `${firstName?.trim() ?? ""} ${lastName?.trim() ?? ""}`.trim();
}
