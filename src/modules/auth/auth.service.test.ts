import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it } from "vitest";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { AuthService } from "./auth.service";
import type { AuthUserRecord, AuthUserRepository } from "./auth.types";

class FakeAuthRepository implements AuthUserRepository {
  constructor(private readonly user: AuthUserRecord | null) {}

  async findByUsername(username: string): Promise<AuthUserRecord | null> {
    return this.user?.username === username ? this.user : null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    return this.user?.id === id ? this.user : null;
  }
}

let activeUser: AuthUserRecord;

beforeAll(async () => {
  activeUser = {
    id: "1",
    name: "KMG Admin",
    username: "admin",
    passwordHash: await bcrypt.hash("admin1234", 4),
    isActive: true,
    role: { id: "1", code: "ADMIN", name: "เจ้าของร้าน", isActive: true }
  };
});

describe("AuthService", () => {
  it("returns an access token and a public user for valid credentials", async () => {
    const service = new AuthService(new FakeAuthRepository(activeUser));

    const result = await service.login({ username: "admin", password: "admin1234" });

    expect(result.tokenType).toBe("Bearer");
    expect(result.expiresIn).toBe(env.JWT_EXPIRES_IN);
    expect(result.user).toEqual({
      id: "1",
      name: "KMG Admin",
      username: "admin",
      role: { id: "1", code: "ADMIN", name: "เจ้าของร้าน" }
    });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(jwt.verify(result.accessToken, env.JWT_SECRET)).toMatchObject({ sub: "1", role: "ADMIN" });
  });

  it("rejects invalid credentials with a generic unauthorized error", async () => {
    const service = new AuthService(new FakeAuthRepository(activeUser));

    await expect(service.login({ username: "admin", password: "incorrect" })).rejects.toMatchObject({
      statusCode: 401,
      code: "UNAUTHORIZED",
      message: "Invalid username or password"
    });
  });

  it.each([
    { userActive: false, roleActive: true },
    { userActive: true, roleActive: false }
  ])("rejects inactive user or role", async ({ userActive, roleActive }) => {
    const repository = new FakeAuthRepository({
      ...activeUser,
      isActive: userActive,
      role: { ...activeUser.role, isActive: roleActive }
    });

    await expect(new AuthService(repository).login({ username: "admin", password: "admin1234" }))
      .rejects.toBeInstanceOf(AppError);
  });

  it("returns an active current user for any role", async () => {
    const staff = {
      ...activeUser,
      role: { ...activeUser.role, id: "2", code: "STAFF", name: "พนักงาน" }
    };

    await expect(new AuthService(new FakeAuthRepository(staff)).getActiveUserById("1"))
      .resolves.toMatchObject({ id: "1", role: { code: "STAFF" } });
  });
});
