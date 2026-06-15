export const ROLE_CODES = {
  ADMIN: "ADMIN",
  STAFF: "STAFF",
  RIDER: "RIDER",
  ACCOUNTANT: "ACCOUNTANT"
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];
