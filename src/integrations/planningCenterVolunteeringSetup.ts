import {
  createFieldDefinition,
  createFieldOption,
  createTab,
  listAllPeopleResources,
  PlanningCenterApiError
} from "./planningCenterPeopleApi";

export const PLANNING_CENTER_VOLUNTEERING_TAB_NAME = "SW Volunteering";

export const volunteeringFieldKeys = [
  "overall_frequency",
  "frequency_limits",
  "availability",
  "serving_areas",
  "requirements",
  "special_events",
  "last_synced"
] as const;

export type VolunteeringFieldKey = (typeof volunteeringFieldKeys)[number];

export interface VolunteeringFieldIds {
  [key: string]: string;
}

export interface PlanningCenterVolunteeringSetupState {
  status: "ready" | "error";
  tabId?: string;
  fields?: Partial<Record<VolunteeringFieldKey, string>>;
  completedAt?: string;
  error?: string;
}

interface FieldSpec {
  key: VolunteeringFieldKey;
  name: string;
  dataType: string;
  sequence: number;
  selectOptions?: string[];
}

const FIELD_SPECS: FieldSpec[] = [
  {
    key: "overall_frequency",
    name: "Overall Frequency",
    dataType: "select",
    sequence: 10,
    selectOptions: [
      "Every week",
      "2–3 times per month",
      "Twice per month",
      "Once per month",
      "Occasionally",
      "Flexible / as needed"
    ]
  },
  {
    key: "frequency_limits",
    name: "Frequency Limits",
    dataType: "text",
    sequence: 20
  },
  {
    key: "availability",
    name: "Availability",
    dataType: "text",
    sequence: 30
  },
  {
    key: "serving_areas",
    name: "Serving areas",
    dataType: "text",
    sequence: 40
  },
  {
    key: "requirements",
    name: "Requirements",
    dataType: "text",
    sequence: 50
  },
  {
    key: "special_events",
    name: "Special Events",
    dataType: "boolean",
    sequence: 60
  },
  {
    key: "last_synced",
    name: "Last synced",
    dataType: "date",
    sequence: 70
  }
];

export async function ensurePlanningCenterVolunteeringFields(
  accessToken: string,
  existing?: PlanningCenterVolunteeringSetupState | null
): Promise<PlanningCenterVolunteeringSetupState> {
  try {
    const tabId = await ensureTab(accessToken, existing?.tabId);
    const fields: Partial<Record<VolunteeringFieldKey, string>> = {
      ...(existing?.fields ?? {})
    };

    const definitions = await listAllPeopleResources<{ name: string; data_type: string }>(
      accessToken,
      `/tabs/${tabId}/field_definitions`
    );

    for (const spec of FIELD_SPECS) {
      const fieldId = await ensureFieldDefinition(
        accessToken,
        tabId,
        spec,
        definitions,
        fields[spec.key]
      );
      fields[spec.key] = fieldId;
    }

    return {
      status: "ready",
      tabId,
      fields,
      completedAt: new Date().toISOString()
    };
  } catch (error) {
    const message =
      error instanceof PlanningCenterApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unable to set up Planning Center custom fields.";

    console.error("Planning Center volunteering field setup failed", error);

    return {
      status: "error",
      tabId: existing?.tabId,
      fields: existing?.fields,
      error: message
    };
  }
}

async function ensureTab(accessToken: string, knownTabId?: string): Promise<string> {
  if (knownTabId) {
    try {
      await listAllPeopleResources(accessToken, `/tabs/${knownTabId}/field_definitions`);
      return knownTabId;
    } catch {
      // Tab removed in PC; fall through to resolve by name.
    }
  }

  const tabs = await listAllPeopleResources<{ name: string }>(accessToken, "/tabs");
  const existing = tabs.find(
    (tab) => tab.attributes.name?.trim() === PLANNING_CENTER_VOLUNTEERING_TAB_NAME
  );

  if (existing) {
    return existing.id;
  }

  const created = await createTab(accessToken, PLANNING_CENTER_VOLUNTEERING_TAB_NAME);
  return created.id;
}

async function ensureFieldDefinition(
  accessToken: string,
  tabId: string,
  spec: FieldSpec,
  existingDefinitions: { id: string; attributes: { name?: string } }[],
  knownFieldId?: string
): Promise<string> {
  if (knownFieldId) {
    const stillExists = existingDefinitions.some((row) => row.id === knownFieldId);
    if (stillExists) {
      await ensureSelectOptions(accessToken, spec, knownFieldId);
      return knownFieldId;
    }
  }

  const byName = existingDefinitions.find(
    (row) => row.attributes.name?.trim() === spec.name
  );

  if (byName) {
    await ensureSelectOptions(accessToken, spec, byName.id);
    return byName.id;
  }

  const created = await createFieldDefinition(accessToken, tabId, {
    name: spec.name,
    dataType: spec.dataType,
    sequence: spec.sequence
  });

  await ensureSelectOptions(accessToken, spec, created.id);

  existingDefinitions.push(created);

  return created.id;
}

async function ensureSelectOptions(
  accessToken: string,
  spec: FieldSpec,
  fieldDefinitionId: string
): Promise<void> {
  if (!spec.selectOptions?.length) {
    return;
  }

  const existing = await listAllPeopleResources<{ value: string }>(
    accessToken,
    `/field_definitions/${fieldDefinitionId}/field_options`
  );

  const existingValues = new Set(
    existing.map((row) => row.attributes.value?.trim()).filter(Boolean)
  );

  let sequence = 1;

  for (const option of spec.selectOptions) {
    if (!existingValues.has(option)) {
      await createFieldOption(accessToken, fieldDefinitionId, option, sequence);
      existingValues.add(option);
    }

    sequence += 1;
  }
}
