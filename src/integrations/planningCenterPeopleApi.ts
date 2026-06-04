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
