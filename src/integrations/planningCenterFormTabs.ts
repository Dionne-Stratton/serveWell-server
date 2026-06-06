import { listAdminForms } from "../db/adminForms";
import {
  getPlanningCenterIntegration,
  getPlanningCenterIntegrationSettings,
  updatePlanningCenterIntegrationSettings
} from "../db/planningCenterIntegrations";
import type { Env } from "../types";
import { getPlanningCenterAccessToken } from "./planningCenterAccess";
import {
  ensurePlanningCenterVolunteeringFields,
  planningCenterTabNameForForm,
  type PlanningCenterVolunteeringSetupState
} from "./planningCenterVolunteeringSetup";

export type PlanningCenterFormTabsSettings = Record<
  string,
  PlanningCenterVolunteeringSetupState
>;

export interface EnsureFormTabResult {
  tabName: string;
  setup: PlanningCenterVolunteeringSetupState;
}

export function parsePlanningCenterFormTabsSettings(
  settings: Record<string, unknown> | null | undefined
): PlanningCenterFormTabsSettings {
  const raw = settings?.formTabs;

  if (!raw || typeof raw !== "object") {
    return {};
  }

  const formTabs: PlanningCenterFormTabsSettings = {};

  for (const [formId, value] of Object.entries(raw)) {
    const parsed = parseVolunteeringSetupState(value);

    if (parsed) {
      formTabs[formId] = parsed;
    }
  }

  return formTabs;
}

export async function ensurePlanningCenterTabsForAllForms(
  accessToken: string,
  forms: { id: number; name: string }[],
  existingFormTabs: PlanningCenterFormTabsSettings
): Promise<{ formTabs: PlanningCenterFormTabsSettings; hasError: boolean }> {
  const formTabs: PlanningCenterFormTabsSettings = { ...existingFormTabs };
  let hasError = false;

  for (const form of forms) {
    const key = String(form.id);
    const tabName = planningCenterTabNameForForm(form.name);
    const setup = await ensurePlanningCenterVolunteeringFields(
      accessToken,
      tabName,
      formTabs[key]
    );
    formTabs[key] = setup;

    if (setup.status === "error") {
      hasError = true;
    }
  }

  return { formTabs, hasError };
}

export async function ensurePlanningCenterTabForForm(
  env: Env,
  organizationId: number,
  formId: number,
  formName: string
): Promise<EnsureFormTabResult | null> {
  const integration = await getPlanningCenterIntegration(env, organizationId);

  if (!integration || integration.status !== "connected") {
    return null;
  }

  const accessToken = await getPlanningCenterAccessToken(env, organizationId);

  if (!accessToken) {
    return null;
  }

  const settings = await getPlanningCenterIntegrationSettings(env, organizationId);
  const formTabs = parsePlanningCenterFormTabsSettings(settings);
  const key = String(formId);
  const tabName = planningCenterTabNameForForm(formName);
  const setup = await ensurePlanningCenterVolunteeringFields(
    accessToken,
    tabName,
    formTabs[key]
  );

  formTabs[key] = setup;

  await updatePlanningCenterIntegrationSettings(env, organizationId, {
    ...settings,
    formTabs
  });

  return { tabName, setup };
}

export async function ensureOrganizationPlanningCenterFormTabsOnConnect(
  env: Env,
  organizationId: number,
  accessToken: string,
  priorSettings: Record<string, unknown> | null
): Promise<{ formTabs: PlanningCenterFormTabsSettings; hasError: boolean }> {
  const forms = await listAdminForms(env, organizationId);
  const existingFormTabs = parsePlanningCenterFormTabsSettings(priorSettings);

  return ensurePlanningCenterTabsForAllForms(accessToken, forms, existingFormTabs);
}

function parseVolunteeringSetupState(
  value: unknown
): PlanningCenterVolunteeringSetupState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as PlanningCenterVolunteeringSetupState;

  if (record.status !== "ready" && record.status !== "error") {
    return null;
  }

  return record;
}
