const PEOPLE_API_BASE = "https://api.planningcenteronline.com/people/v2";
const USER_AGENT = "ServeWell Planning Center Integration (support@servewell.app)";

export interface JsonApiResource<TAttributes = Record<string, unknown>> {
  type: string;
  id: string;
  attributes: TAttributes;
  relationships?: Record<
    string,
    { data: { type: string; id: string } | { type: string; id: string }[] | null }
  >;
}

export interface JsonApiListResponse<TAttributes = Record<string, unknown>> {
  data: JsonApiResource<TAttributes>[];
  links?: { next?: string | null };
}

export interface JsonApiSingleResponse<TAttributes = Record<string, unknown>> {
  data: JsonApiResource<TAttributes>;
}

export class PlanningCenterApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function planningCenterPeopleRequest<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${PEOPLE_API_BASE}${path}`;
  const headers = new Headers(init.headers);
  headers.set("User-Agent", USER_AGENT);
  headers.set("Authorization", `Bearer ${accessToken}`);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      body &&
      typeof body === "object" &&
      "errors" in body &&
      Array.isArray((body as { errors: unknown[] }).errors)
        ? (body as { errors: { detail?: string; title?: string }[] }).errors
            .map((error) => error.detail ?? error.title)
            .filter(Boolean)
            .join("; ")
        : null;

    throw new PlanningCenterApiError(
      detail ?? `Planning Center People API failed with status ${response.status}.`,
      response.status,
      body
    );
  }

  return body as T;
}

export async function listAllPeopleResources<TAttributes>(
  accessToken: string,
  path: string
): Promise<JsonApiResource<TAttributes>[]> {
  const items: JsonApiResource<TAttributes>[] = [];
  let nextPath: string | null = path;

  if (!nextPath.includes("per_page")) {
    nextPath += nextPath.includes("?") ? "&per_page=100" : "?per_page=100";
  }

  while (nextPath) {
    const page: JsonApiListResponse<TAttributes> =
      await planningCenterPeopleRequest<JsonApiListResponse<TAttributes>>(
        accessToken,
        nextPath
      );

    items.push(...(page.data ?? []));

    const nextLink: string | null | undefined = page.links?.next;
    if (!nextLink) {
      break;
    }

    nextPath = nextLink.startsWith("http")
      ? nextLink.replace(PEOPLE_API_BASE, "")
      : nextLink;
  }

  return items;
}

export async function createTab(
  accessToken: string,
  name: string,
  sequence = 1
): Promise<JsonApiResource<{ name: string; sequence: number; slug: string }>> {
  const response = await planningCenterPeopleRequest<
    JsonApiSingleResponse<{ name: string; sequence: number; slug: string }>
  >(accessToken, "/tabs", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "Tab",
        attributes: { name, sequence }
      }
    })
  });

  return response.data;
}

export async function createFieldDefinition(
  accessToken: string,
  tabId: string,
  input: {
    name: string;
    dataType: string;
    sequence: number;
    config?: Record<string, string>;
  }
): Promise<JsonApiResource<{ name: string; data_type: string; sequence: number }>> {
  const response = await planningCenterPeopleRequest<
    JsonApiSingleResponse<{ name: string; data_type: string; sequence: number }>
  >(accessToken, `/tabs/${tabId}/field_definitions`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "FieldDefinition",
        attributes: {
          name: input.name,
          data_type: input.dataType,
          sequence: input.sequence,
          ...(input.config ? { config: input.config } : {})
        }
      }
    })
  });

  return response.data;
}

export async function createFieldOption(
  accessToken: string,
  fieldDefinitionId: string,
  value: string,
  sequence: number
): Promise<void> {
  await planningCenterPeopleRequest(accessToken, `/field_definitions/${fieldDefinitionId}/field_options`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "FieldOption",
        attributes: { value, sequence }
      }
    })
  });
}

export function phoneDigitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export async function findPersonByEmail(
  accessToken: string,
  email: string
): Promise<JsonApiResource<{ first_name: string; last_name: string }> | null> {
  const normalized = email.trim().toLowerCase();
  const people = await listAllPeopleResources<{ first_name: string; last_name: string }>(
    accessToken,
    `/people?where[search_name_or_email]=${encodeURIComponent(normalized)}`
  );

  return people[0] ?? null;
}

/** Match an existing person by phone (digits-normalized), not by name alone. */
export async function findPersonByPhone(
  accessToken: string,
  phone: string
): Promise<JsonApiResource<{ first_name: string; last_name: string }> | null> {
  const trimmed = phone.trim();
  const digits = phoneDigitsOnly(trimmed);

  if (!digits) {
    return null;
  }

  const personId = await findPersonIdByPhoneDigits(accessToken, trimmed, digits);

  if (personId) {
    return fetchPersonById(accessToken, personId);
  }

  for (const term of [trimmed, digits]) {
    const people = await listAllPeopleResources<{ first_name: string; last_name: string }>(
      accessToken,
      `/people?where[search_name_or_email]=${encodeURIComponent(term)}`
    );

    for (const person of people) {
      if (await personHasPhoneDigits(accessToken, person.id, digits)) {
        return person;
      }
    }
  }

  return null;
}

async function findPersonIdByPhoneDigits(
  accessToken: string,
  trimmedPhone: string,
  digits: string
): Promise<string | null> {
  const queries = [
    `/phone_numbers?where[number]=${encodeURIComponent(trimmedPhone)}`,
    `/phone_numbers?where[number]=${encodeURIComponent(digits)}`
  ];

  for (const path of queries) {
    try {
      const rows = await listAllPeopleResources<{ number: string }>(accessToken, path);

      for (const row of rows) {
        if (phoneDigitsOnly(row.attributes.number ?? "") !== digits) {
          continue;
        }

        const personId = personIdFromPhoneNumberResource(row);

        if (personId) {
          return personId;
        }
      }
    } catch {
      // Some accounts may not support this filter; fall back to people search.
    }
  }

  return null;
}

function personIdFromPhoneNumberResource(
  row: JsonApiResource<{ number: string }>
): string | null {
  const person = row.relationships?.person?.data;

  if (person && typeof person === "object" && "id" in person && !Array.isArray(person)) {
    return person.id;
  }

  return null;
}

async function fetchPersonById(
  accessToken: string,
  personId: string
): Promise<JsonApiResource<{ first_name: string; last_name: string }>> {
  const response = await planningCenterPeopleRequest<
    JsonApiSingleResponse<{ first_name: string; last_name: string }>
  >(accessToken, `/people/${personId}`);

  return response.data;
}

async function personHasPhoneDigits(
  accessToken: string,
  personId: string,
  digits: string
): Promise<boolean> {
  const phones = await listAllPeopleResources<{ number: string }>(
    accessToken,
    `/people/${personId}/phone_numbers`
  );

  return phones.some((row) => phoneDigitsOnly(row.attributes.number ?? "") === digits);
}

/** Email first, then phone; never match on name alone. */
export async function findExistingPersonByEmailOrPhone(
  accessToken: string,
  input: { email: string | null; phone: string | null }
): Promise<JsonApiResource<{ first_name: string; last_name: string }> | null> {
  const email = input.email?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";

  if (email) {
    const byEmail = await findPersonByEmail(accessToken, email);

    if (byEmail) {
      return byEmail;
    }
  }

  if (phone) {
    return findPersonByPhone(accessToken, phone);
  }

  return null;
}

export async function createPerson(
  accessToken: string,
  input: { firstName: string; lastName: string }
): Promise<JsonApiResource<{ first_name: string; last_name: string }>> {
  const response = await planningCenterPeopleRequest<
    JsonApiSingleResponse<{ first_name: string; last_name: string }>
  >(accessToken, "/people", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "Person",
        attributes: {
          first_name: input.firstName,
          last_name: input.lastName
        }
      }
    })
  });

  return response.data;
}

export async function updatePersonName(
  accessToken: string,
  personId: string,
  input: { firstName: string; lastName: string }
): Promise<void> {
  await planningCenterPeopleRequest(accessToken, `/people/${personId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "Person",
        id: personId,
        attributes: {
          first_name: input.firstName,
          last_name: input.lastName
        }
      }
    })
  });
}

export async function upsertPrimaryEmail(
  accessToken: string,
  personId: string,
  address: string
): Promise<void> {
  const normalized = address.trim().toLowerCase();
  const existing = await listAllPeopleResources<{ address: string; primary: boolean }>(
    accessToken,
    `/people/${personId}/emails`
  );

  const match = existing.find((row) => row.attributes.address?.trim().toLowerCase() === normalized);
  const primary = existing.find((row) => row.attributes.primary);

  if (match) {
    if (!match.attributes.primary) {
      await planningCenterPeopleRequest(accessToken, `/emails/${match.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "Email",
            id: match.id,
            attributes: { primary: true }
          }
        })
      });
    }

    return;
  }

  if (primary) {
    await planningCenterPeopleRequest(accessToken, `/emails/${primary.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "Email",
          id: primary.id,
          attributes: { address: normalized, primary: true }
        }
      })
    });

    return;
  }

  await planningCenterPeopleRequest(accessToken, `/people/${personId}/emails`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "Email",
        attributes: {
          address: normalized,
          location: "Home",
          primary: true
        }
      }
    })
  });
}

export async function upsertPrimaryPhone(
  accessToken: string,
  personId: string,
  number: string
): Promise<void> {
  const normalized = number.trim();
  const digits = phoneDigitsOnly(normalized);
  const existing = await listAllPeopleResources<{ number: string; primary: boolean }>(
    accessToken,
    `/people/${personId}/phone_numbers`
  );

  const match = existing.find((row) => {
    const rowNumber = row.attributes.number?.trim() ?? "";

    return (
      rowNumber === normalized ||
      (digits.length > 0 && phoneDigitsOnly(rowNumber) === digits)
    );
  });
  const primary = existing.find((row) => row.attributes.primary);

  if (match) {
    if (!match.attributes.primary) {
      await planningCenterPeopleRequest(accessToken, `/phone_numbers/${match.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "PhoneNumber",
            id: match.id,
            attributes: { primary: true }
          }
        })
      });
    }

    return;
  }

  if (primary) {
    await planningCenterPeopleRequest(accessToken, `/phone_numbers/${primary.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "PhoneNumber",
          id: primary.id,
          attributes: { number: normalized, primary: true, location: "Mobile" }
        }
      })
    });

    return;
  }

  await planningCenterPeopleRequest(accessToken, `/people/${personId}/phone_numbers`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "PhoneNumber",
        attributes: {
          number: normalized,
          location: "Mobile",
          primary: true
        }
      }
    })
  });
}

export async function upsertPersonFieldValue(
  accessToken: string,
  personId: string,
  fieldDefinitionId: string,
  value: string
): Promise<void> {
  const existing = await listAllPeopleResources<{
    value: string;
    field_definition_id?: string;
  }>(accessToken, `/people/${personId}/field_data`);

  const match = existing.find((row) => {
    const relatedId = row.relationships?.field_definition?.data;
    if (relatedId && typeof relatedId === "object" && "id" in relatedId) {
      return relatedId.id === fieldDefinitionId;
    }

    return row.attributes.field_definition_id === fieldDefinitionId;
  });

  if (match) {
    await planningCenterPeopleRequest(accessToken, `/field_data/${match.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "FieldDatum",
          id: match.id,
          attributes: { value }
        }
      })
    });

    return;
  }

  await planningCenterPeopleRequest(accessToken, `/people/${personId}/field_data`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "FieldDatum",
        attributes: {
          field_definition_id: fieldDefinitionId,
          value
        }
      }
    })
  });
}

export async function createPersonNote(
  accessToken: string,
  personId: string,
  note: string
): Promise<void> {
  await planningCenterPeopleRequest(accessToken, `/people/${personId}/notes`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "Note",
        attributes: { note }
      }
    })
  });
}
