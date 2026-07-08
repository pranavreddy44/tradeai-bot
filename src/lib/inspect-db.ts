import { db } from './db';

async function main() {
  console.log('=== Bot Settings ===');
  const settings = await db.botSetting.findMany();
  for (const s of settings) {
    // Hide api keys slightly but print enough to inspect
    if (s.key.toLowerCase().includes('key') || s.key.toLowerCase().includes('token')) {
      const val = s.value;
      const masked = val ? `${val.slice(0, 6)}...${val.slice(-4)}` : 'empty';
      console.log(`  ${s.key}: ${masked} (len: ${val?.length || 0})`);
    } else {
      console.log(`  ${s.key}: ${s.value}`);
    }
  }


  console.log('\n=== Telegram Channels ===');
  const telegramChannels = await db.telegramChannel.findMany();
  for (const c of telegramChannels) {
    console.log(`  Name: ${c.name}, ID: ${c.channelId}, Active: ${c.isActive}, LastMsgID: ${c.lastMessageId}`);
  }

  console.log('\n=== Recent Signals (Last 5) ===');
  const signals = await db.tradeSignal.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const s of signals) {
    console.log(`  Symbol: ${s.symbol}, Action: ${s.action}, Source: ${s.source}, Status: ${s.status}, CreatedAt: ${s.createdAt.toISOString()}, Model: ${s.modelName}`);
    console.log(`    Reasoning: ${s.reasoning}`);
  }
}

main().catch(console.error);
