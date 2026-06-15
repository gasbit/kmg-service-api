import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../config/database";

export class UserRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  findById(id: bigint) {
    return this.db.user.findUnique({ where: { id }, include: { role: true } });
  }
}
