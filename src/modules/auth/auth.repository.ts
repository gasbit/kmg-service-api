import { prisma } from "../../config/database";
import type { AuthUserRecord, AuthUserRepository } from "./auth.types";

const authUserSelect = {
  id: true,
  name: true,
  username: true,
  passwordHash: true,
  isActive: true,
  role: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true
    }
  }
} as const;

function serializeUser(user: {
  id: bigint;
  name: string;
  username: string;
  passwordHash: string;
  isActive: boolean;
  role: { id: bigint; code: string; name: string; isActive: boolean };
}): AuthUserRecord {
  return {
    ...user,
    id: user.id.toString(),
    role: { ...user.role, id: user.role.id.toString() }
  };
}

export class PrismaAuthRepository implements AuthUserRepository {
  async findByUsername(username: string): Promise<AuthUserRecord | null> {
    const user = await prisma.user.findUnique({ where: { username }, select: authUserSelect });
    return user ? serializeUser(user) : null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    if (!/^[1-9][0-9]*$/.test(id)) return null;
    const user = await prisma.user.findUnique({ where: { id: BigInt(id) }, select: authUserSelect });
    return user ? serializeUser(user) : null;
  }
}
