const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const settings = await db.botSetting.findMany();
  console.log('Settings in DB:');
  console.log(JSON.stringify(settings, null, 2));
  await db.$disconnect();
}

main().catch(console.error);
