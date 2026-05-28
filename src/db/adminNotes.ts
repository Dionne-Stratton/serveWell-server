import type { Env } from "../types";

const MAX_NOTE_LENGTH = 4000;

export type AdminNoteRecord = {
  id: number;
  submissionId: number;
  adminUserId: number;
  note: string;
  createdAt: string;
};

function mapNoteRow(row: {
  id: number;
  submission_id: number;
  admin_user_id: number;
  note: string;
  created_at: string;
}): AdminNoteRecord {
  return {
    id: row.id,
    submissionId: row.submission_id,
    adminUserId: row.admin_user_id,
    note: row.note,
    createdAt: row.created_at
  };
}

export function validateAdminNoteText(note: unknown): string | null {
  if (typeof note !== "string") {
    return null;
  }

  const trimmed = note.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_NOTE_LENGTH) {
    return null;
  }

  return trimmed;
}

export async function createAdminNote(
  env: Env,
  submissionId: number,
  organizationId: number,
  adminUserId: number,
  noteText: string
): Promise<AdminNoteRecord | null> {
  const submission = await env.DB.prepare(
    `
    SELECT id, organization_id, form_id
    FROM volunteer_submissions
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(submissionId, organizationId)
    .first<{ id: number; organization_id: number; form_id: number }>();

  if (!submission) {
    return null;
  }

  const insert = await env.DB.prepare(
    `
    INSERT INTO admin_notes (
      organization_id,
      form_id,
      submission_id,
      admin_user_id,
      note
    ) VALUES (?, ?, ?, ?, ?)
  `
  )
    .bind(
      submission.organization_id,
      submission.form_id,
      submissionId,
      adminUserId,
      noteText
    )
    .run();

  const noteId = insert.meta.last_row_id;

  if (!noteId) {
    return null;
  }

  const row = await env.DB.prepare(
    `
    SELECT id, submission_id, admin_user_id, note, created_at
    FROM admin_notes
    WHERE id = ?
    LIMIT 1
    `
  )
    .bind(noteId)
    .first<{
      id: number;
      submission_id: number;
      admin_user_id: number;
      note: string;
      created_at: string;
    }>();

  return row ? mapNoteRow(row) : null;
}

export async function deleteAdminNote(
  env: Env,
  noteId: number,
  organizationId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    DELETE FROM admin_notes
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(noteId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
