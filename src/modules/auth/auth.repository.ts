import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";

export class AuthRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  findActiveUserByUsername(username: string) {
    return this.db.user.findFirst({
      where: { username, isActive: true, role: { isActive: true } },
      include: { role: true }
    });
  }

  findActiveUserById(id: bigint) {
    return this.db.user.findFirst({
      where: { id, isActive: true, role: { isActive: true } },
      include: { role: true }
    });
  }
}
