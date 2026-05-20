import { createVolunteerSubmission } from "../db/volunteerSubmissions";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";
import { validateVolunteerSubmission } from "../validation/volunteerSubmissions";

export async function volunteerSubmissionRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/volunteer-submissions") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON.", "INVALID_JSON");
    }

    try {
      const validation = await validateVolunteerSubmission(env, body);

      if (!validation.input) {
        return badRequest(validation.error ?? "Invalid volunteer submission.");
      }

      const submissionId = await createVolunteerSubmission(env, validation.input);

      return json(
        {
          success: true,
          data: {
            submissionId,
            message:
              "Thank you! Your interest has been submitted. Someone from the church will follow up with you soon."
          }
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("Failed to create volunteer submission", error);
      return serverError("Unable to submit volunteer interest.");
    }
  }

  return notFound();
}
