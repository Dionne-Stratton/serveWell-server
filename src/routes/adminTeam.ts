import { requireOwner } from "../auth/adminOwnerGuard";
import { requireAdmin } from "../auth/adminGuard";
import { sendAdminInviteForOrganization } from "../auth/adminInviteAccept";
import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import {
  listPendingInvitesForOrganization,
  revokeAdminInvite
} from "../db/adminInvites";
import {
  deactivateAdminUser,
  findActiveAdminById,
  listActiveAdminsForOrganization
} from "../db/adminUsers";
import { findActiveOrganizationById } from "../db/organizations";
import { badRequest, json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";

export async function tryAdminTeamRoute(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  if (pathname === "/api/admin/team") {
    if (request.method === "GET") {
      return getTeam(request, env);
    }

    return methodNotAllowed();
  }

  if (pathname === "/api/admin/team/invites") {
    if (request.method === "POST") {
      return postTeamInvite(request, env);
    }

    return methodNotAllowed();
  }

  const revokeInviteMatch = pathname.match(/^\/api\/admin\/team\/invites\/(\d+)$/);

  if (revokeInviteMatch) {
    const inviteId = Number(revokeInviteMatch[1]);

    if (request.method === "DELETE") {
      return deleteTeamInvite(request, env, inviteId);
    }

    return methodNotAllowed();
  }

  const memberMatch = pathname.match(/^\/api\/admin\/team\/members\/(\d+)$/);

  if (memberMatch) {
    const adminUserId = Number(memberMatch[1]);

    if (request.method === "DELETE") {
      return deleteTeamMember(request, env, adminUserId);
    }

    return methodNotAllowed();
  }

  return null;
}

async function getTeam(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organizationId = auth.admin!.organizationId;
    const [members, invites] = await Promise.all([
      listActiveAdminsForOrganization(env, organizationId),
      listPendingInvitesForOrganization(env, organizationId)
    ]);

    return json({
      success: true,
      data: {
        members: members.map((member) => ({
          id: member.id,
          email: member.email,
          displayName: member.displayName,
          role: member.role,
          status: "active" as const
        })),
        pendingInvites: invites.map((invite) => ({
          id: invite.id,
          email: invite.email,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
          status: "pending" as const
        })),
        canManage: auth.admin!.role === "owner"
      }
    });
  } catch (error) {
    console.error("Failed to load admin team", error);
    return serverError("Unable to load team.");
  }
}

async function postTeamInvite(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireOwner(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    if (organization.slug === DEMO_ORGANIZATION_SLUG) {
      return badRequest("Team invites are not available for the demo organization.");
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return badRequest("Request body must be valid JSON.", "INVALID_JSON");
    }

    if (!isRecord(body)) {
      return badRequest("Request body must be a JSON object.");
    }

    const email = normalizeRequiredString(body.email);

    if (!email) {
      return badRequest("Email is required.");
    }

    const result = await sendAdminInviteForOrganization(env, {
      organizationId: organization.id,
      organizationName: organization.name,
      ownerAdmin: auth.admin!,
      inviteeEmail: email
    });

    if (!result.ok) {
      return badRequest(result.message, result.code);
    }

    return json(
      {
        success: true,
        data: { message: "Invitation sent." }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to send team invite", error);
    return serverError("Unable to send invitation.");
  }
}

async function deleteTeamInvite(
  request: Request,
  env: Env,
  inviteId: number
): Promise<Response> {
  try {
    const auth = await requireOwner(request, env);

    if (auth.response) {
      return auth.response;
    }

    const revoked = await revokeAdminInvite(env, inviteId, auth.admin!.organizationId);

    if (!revoked) {
      return notFound();
    }

    return json({
      success: true,
      data: { revoked: true }
    });
  } catch (error) {
    console.error("Failed to revoke team invite", error);
    return serverError("Unable to revoke invitation.");
  }
}

async function deleteTeamMember(
  request: Request,
  env: Env,
  adminUserId: number
): Promise<Response> {
  try {
    const auth = await requireOwner(request, env);

    if (auth.response) {
      return auth.response;
    }

    if (adminUserId === auth.admin!.id) {
      return badRequest("You cannot remove yourself.");
    }

    const target = await findActiveAdminById(env, adminUserId);

    if (!target || target.organizationId !== auth.admin!.organizationId) {
      return notFound();
    }

    if (target.role === "owner") {
      return badRequest("The organization owner cannot be removed.");
    }

    const removed = await deactivateAdminUser(env, adminUserId, auth.admin!.organizationId);

    if (!removed) {
      return notFound();
    }

    return json({
      success: true,
      data: { removed: true }
    });
  } catch (error) {
    console.error("Failed to remove team member", error);
    return serverError("Unable to remove team member.");
  }
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
