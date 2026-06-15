import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { ROLE_CODES } from "../../constants/role.constants";

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { code: ROLE_CODES.ADMIN },
    update: { name: "เจ้าของร้าน", isActive: true },
    create: { code: ROLE_CODES.ADMIN, name: "เจ้าของร้าน" }
  });

  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  const name = process.env.ADMIN_NAME ?? "KMG Admin";
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { username },
    update: {
      name,
      passwordHash,
      isActive: true,
      roleId: adminRole.id
    },
    create: {
      username,
      name,
      passwordHash,
      roleId: adminRole.id
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
