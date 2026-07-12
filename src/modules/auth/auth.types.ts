import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";

export interface AuthUserRecord extends AuthenticatedRequestUser {
  passwordHash: string;
  isActive: boolean;
  role: AuthenticatedRequestUser["role"] & { isActive: boolean };
}

export interface AuthUserRepository {
  findByUsername(username: string): Promise<AuthUserRecord | null>;
  findById(id: string): Promise<AuthUserRecord | null>;
}

export interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: AuthenticatedRequestUser;
}
