import { getGrowwLivePrice } from './broker/live-prices';

async function test() {
  const symbols = ['WIPRO', 'TITAGARH', 'SUZLON', 'JSWENERGY', 'RELIANCE'];
  console.log('Testing Live Prices fallback via Yahoo Finance:');
  for (const sym of symbols) {
    const price = await getGrowwLivePrice(sym);
    console.log(`  Symbol: ${sym} -> Price: ${price}`);
  }
}

test().catch(console.error);
