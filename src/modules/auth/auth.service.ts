import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import type { AuthenticatedRequestUser } from "../../shared/types/auth.types";
import { PrismaAuthRepository } from "./auth.repository";
import type { LoginInput } from "./auth.schema";
import type { AuthUserRecord, AuthUserRepository, LoginResult } from "./auth.types";

function toPublicUser(user: AuthUserRecord): AuthenticatedRequestUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: { id: user.role.id, code: user.role.code, name: user.role.name }
  };
}

function assertActive(user: AuthUserRecord | null): asserts user is AuthUserRecord {
  if (!user?.isActive || !user.role.isActive) {
    throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Authentication required");
  }
}

export class AuthService {
  constructor(private readonly repository: AuthUserRepository = new PrismaAuthRepository()) {}

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.repository.findByUsername(input.username);
    const passwordMatches = user ? await bcrypt.compare(input.password, user.passwordHash) : false;

    if (!user || !passwordMatches || !user.isActive || !user.role.isActive) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, "Invalid username or password");
    }

    const signOptions: SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
    };
    const accessToken = jwt.sign({ role: user.role.code }, env.JWT_SECRET, {
      ...signOptions,
      subject: user.id
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: env.JWT_EXPIRES_IN,
      user: toPublicUser(user)
    };
  }

  async getActiveUserById(id: string): Promise<AuthenticatedRequestUser> {
    const user = await this.repository.findById(id);
    assertActive(user);
    return toPublicUser(user);
  }
}
