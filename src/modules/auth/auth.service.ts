import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { AppError } from "../../shared/errors/AppError";
import { ERROR_CODES } from "../../shared/errors/error-codes";
import type { AuthUser } from "../../shared/types/auth-user.type";
import type { LoginInput } from "./auth.schema";
import { AuthRepository } from "./auth.repository";

export class AuthService {
  constructor(private readonly authRepository = new AuthRepository()) {}

  async login(input: LoginInput) {
    const user = await this.authRepository.findActiveUserByUsername(input.username);
    if (!user) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, "Invalid username or password", 401);
    }

    const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, "Invalid username or password", 401);
    }

    const authUser = this.toAuthUser(user);
    const signOptions: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] };
    const token = jwt.sign(authUser, env.JWT_SECRET, signOptions);

    return { token, user: authUser };
  }

  async me(currentUser: AuthUser) {
    const user = await this.authRepository.findActiveUserById(BigInt(currentUser.id));
    if (!user) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, "User is no longer active", 401);
    }

    return this.toAuthUser(user);
  }

  private toAuthUser(user: { id: bigint; username: string; name: string; role: { code: string } }): AuthUser {
    return {
      id: user.id.toString(),
      username: user.username,
      name: user.name,
      roleCode: user.role.code
    };
  }
}
