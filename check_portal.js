require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
async function main() {
  const portals = await prisma.portal.findMany();
  console.log("Portals:", JSON.stringify(portals, null, 2));
}
main().finally(() => prisma.$disconnect());
