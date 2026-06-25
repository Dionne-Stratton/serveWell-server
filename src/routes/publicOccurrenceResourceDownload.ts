import { sha256Hex } from "../auth/passwordReset";
import { verifyOccurrenceResourceDownloadToken } from "../auth/occurrenceResourceDownloadToken";
import { findValidOccurrenceResourceAccessToken } from "../db/occurrenceResourceAccessTokens";
import { getPublishedOccurrenceResourceForVolunteer } from "../db/publishedOccurrenceResourceDownload";
import { notFound, serverError } from "../http/responses";
import type { Env } from "../types";

function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(filename);

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function extractPlainToken(request: Request, pathname: string): string | null {
  const pathMatch = pathname.match(/^\/api\/public\/schedule-resources\/download\/([^/]+)$/);

  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1]).trim();
    } catch {
      return null;
    }
  }

  if (pathname === "/api/public/schedule-resources/download") {
    const fromQuery = new URL(request.url).searchParams.get("token")?.trim();
    return fromQuery || null;
  }

  return null;
}

export async function tryPublicOccurrenceResourceDownloadRoute(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response | null> {
  const isPathDownload = /^\/api\/public\/schedule-resources\/download(\/|$)/.test(pathname);

  if (!isPathDownload) {
    return null;
  }

  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const plainToken = extractPlainToken(request, pathname);

  if (!plainToken) {
    return notFound();
  }

  let resourceId: number | null = null;
  let submissionId: number | null = null;

  const tokenHash = await sha256Hex(plainToken);
  const access = await findValidOccurrenceResourceAccessToken(env, tokenHash);

  if (access) {
    resourceId = access.resourceId;
    submissionId = access.submissionId;
  } else {
    const signed = await verifyOccurrenceResourceDownloadToken(env, plainToken);

    if (signed) {
      resourceId = signed.resourceId;
      submissionId = signed.submissionId;
    }
  }

  if (!resourceId || !submissionId) {
    return notFound();
  }

  try {
    const result = await getPublishedOccurrenceResourceForVolunteer(
      env,
      resourceId,
      submissionId
    );

    if (result.status === "forbidden" || result.status === "not_found") {
      return notFound();
    }

    if (result.status === "resource_not_found") {
      return notFound();
    }

    if (result.status === "storage_unavailable") {
      return serverError("File storage is not configured.");
    }

    const downloadName = result.displayName?.trim() || result.originalFilename;

    return new Response(result.object.body, {
      status: 200,
      headers: {
        "Content-Type": result.mimeType,
        "Content-Disposition": contentDispositionAttachment(downloadName),
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    console.error("Failed public occurrence resource download", error);
    return serverError("Unable to download resource.");
  }
}
