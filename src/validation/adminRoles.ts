export const adminRoles = ["owner", "admin"] as const;

export type AdminRole = (typeof adminRoles)[number];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (adminRoles as readonly string[]).includes(value);
}
