import bcrypt from "bcryptjs";

import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { logger } from "../../config/logger";

async function main(): Promise<void> {
  const adminRole = await prisma.role.upsert({
    where: { code: "ADMIN" },
    update: { name: "เจ้าของร้าน", isActive: true },
    create: { code: "ADMIN", name: "เจ้าของร้าน" }
  });

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

  await prisma.user.upsert({
    where: { username: env.ADMIN_USERNAME },
    update: {
      name: env.ADMIN_NAME,
      passwordHash,
      isActive: true,
      roleId: adminRole.id
    },
    create: {
      username: env.ADMIN_USERNAME,
      name: env.ADMIN_NAME,
      passwordHash,
      roleId: adminRole.id
    }
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    logger.fatal({ err: error }, "Database seed failed");
    await prisma.$disconnect();
    process.exit(1);
  });
