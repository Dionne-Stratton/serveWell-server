import { getAdminSubmissionDetail, updateAdminSubmission } from "../db/adminSubmissions";
import {
  getPlanningCenterIntegrationSettings,
  updatePlanningCenterIntegrationSettings
} from "../db/planningCenterIntegrations";
import {
  parsePlanningCenterFormTabsSettings,
  type PlanningCenterFormTabsSettings
} from "./planningCenterFormTabs";
import type { Env } from "../types";
import { getPlanningCenterAccessToken } from "./planningCenterAccess";
import { PlanningCenterApiError } from "./planningCenterPeopleApi";
import {
  createPerson,
  createPersonNote,
  findExistingPersonByEmailOrPhone,
  updatePersonName,
  upsertPersonFieldValue,
  upsertPrimaryEmail,
  upsertPrimaryPhone
} from "./planningCenterPeopleApi";
import {
  buildPlanningCenterVolunteerFieldValues,
  type PlanningCenterVolunteerFieldValues
} from "./planningCenterVolunteerFieldValues";
import {
  ensurePlanningCenterVolunteeringFields,
  planningCenterTabNameForForm,
  type PlanningCenterVolunteeringSetupState,
  type VolunteeringFieldKey
} from "./planningCenterVolunteeringSetup";

export interface PushVolunteerToPlanningCenterResult {
  personId: string;
  submissionId: number;
  status: string;
  planningCenterPersonId: string | null;
}

export async function pushVolunteerSubmissionToPlanningCenter(
  env: Env,
  organizationId: number,
  submissionId: number
): Promise<PushVolunteerToPlanningCenterResult> {
  const detail = await getAdminSubmissionDetail(env, submissionId, organizationId);

  if (!detail) {
    throw new PushVolunteerError("Submission not found.", "NOT_FOUND", 404);
  }

  const email = detail.submission.email?.trim() ?? "";
  const phone = detail.submission.phone?.trim() ?? "";

  if (!email && !phone) {
    throw new PushVolunteerError(
      "This submission needs an email address or phone number before it can be added to Planning Center.",
      "VALIDATION_ERROR",
      400
    );
  }

  const accessToken = await getPlanningCenterAccessToken(env, organizationId);

  if (!accessToken) {
    throw new PushVolunteerError(
      "Planning Center is not connected or the access token has expired. Reconnect Planning Center and try again.",
      "INTEGRATION_NOT_CONNECTED",
      400
    );
  }

  const settings = (await getPlanningCenterIntegrationSettings(env, organizationId)) ?? {};
  const formId = detail.submission.formId;
  const formName = detail.submission.formName ?? "Volunteer form";
  const formTabs = parsePlanningCenterFormTabsSettings(settings);
  const formTabKey = String(formId);
  let volunteering: PlanningCenterVolunteeringSetupState | null = formTabs[formTabKey] ?? null;

  const tabName = planningCenterTabNameForForm(formName);
  const needsFieldSetup =
    !volunteering || volunteering.status !== "ready" || !volunteering.fields?.overall_frequency;

  if (needsFieldSetup) {
    const ensured = await ensurePlanningCenterVolunteeringFields(
      accessToken,
      tabName,
      volunteering
    );
    volunteering = ensured;

    if (ensured.status === "ready") {
      const nextFormTabs: PlanningCenterFormTabsSettings = {
        ...formTabs,
        [formTabKey]: ensured
      };
      await updatePlanningCenterIntegrationSettings(env, organizationId, {
        ...settings,
        formTabs: nextFormTabs
      });
    }
  }

  if (!volunteering || volunteering.status !== "ready" || !volunteering.fields) {
    throw new PushVolunteerError(
      volunteering?.error ??
        "Planning Center custom fields are not set up. Reconnect Planning Center and try again.",
      "FIELDS_NOT_READY",
      400
    );
  }

  const syncedAt = new Date().toISOString();
  const fieldValues = buildPlanningCenterVolunteerFieldValues(detail, syncedAt);

  let personId: string;

  try {
    const existing = await findExistingPersonByEmailOrPhone(accessToken, {
      email: email || null,
      phone: phone || null
    });

    if (existing) {
      personId = existing.id;
      await updatePersonName(accessToken, personId, {
        firstName: detail.submission.firstName,
        lastName: detail.submission.lastName
      });
    } else {
      const created = await createPerson(accessToken, {
        firstName: detail.submission.firstName,
        lastName: detail.submission.lastName
      });
      personId = created.id;
    }

    if (email) {
      await upsertPrimaryEmail(accessToken, personId, email);
    }

    if (phone) {
      await upsertPrimaryPhone(accessToken, personId, phone);
    }

    await writeVolunteeringFields(accessToken, personId, volunteering.fields, fieldValues);

    if (fieldValues.supplementalNote) {
      await createPersonNote(
        accessToken,
        personId,
        `ServeWell volunteer intake\n\n${fieldValues.supplementalNote}`
      );
    }
  } catch (error) {
    if (error instanceof PlanningCenterApiError) {
      throw new PushVolunteerError(error.message, "PLANNING_CENTER_API_ERROR", 502);
    }

    throw error;
  }

  const updatePayload: {
    status?: string;
    planningCenterPersonId: string;
  } = { planningCenterPersonId: personId };

  if (!detail.submission.planningCenterPersonId) {
    updatePayload.status = "added_to_planning_center";
  }

  const updated = await updateAdminSubmission(
    env,
    submissionId,
    organizationId,
    updatePayload
  );

  if (!updated) {
    throw new PushVolunteerError("Submission not found.", "NOT_FOUND", 404);
  }

  return {
    personId,
    submissionId,
    status: updated.status,
    planningCenterPersonId: updated.planningCenterPersonId
  };
}

async function writeVolunteeringFields(
  accessToken: string,
  personId: string,
  fieldIds: NonNullable<PlanningCenterVolunteeringSetupState["fields"]>,
  values: PlanningCenterVolunteerFieldValues
): Promise<void> {
  const entries: Array<[VolunteeringFieldKey, string]> = [
    ["overall_frequency", values.overallFrequency],
    ["frequency_limits", values.frequencyLimits],
    ["availability", values.availability],
    ["serving_areas", values.servingAreas],
    ["requirements", values.requirements],
    ["special_events", values.specialEvents],
    ["last_synced", values.lastSynced]
  ];

  for (const [key, value] of entries) {
    const fieldDefinitionId = fieldIds[key];

    if (!fieldDefinitionId) {
      throw new PushVolunteerError(
        `Planning Center field "${key}" is missing. Reconnect Planning Center and try again.`,
        "FIELDS_NOT_READY",
        400
      );
    }

    await upsertPersonFieldValue(accessToken, personId, fieldDefinitionId, value);
  }
}

export class PushVolunteerError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
