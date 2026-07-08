const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const channels = await db.telegramChannel.findMany();
  console.log('Channels configured in DB:');
  console.log(JSON.stringify(channels, null, 2));
  await db.$disconnect();
}

main().catch(console.error);
