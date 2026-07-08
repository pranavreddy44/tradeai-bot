import { resolveInstrumentFromText } from './market/instrument-resolver';

async function test() {
  console.log('Testing instrument resolver:');
  const res1 = await resolveInstrumentFromText('ZENTEC');
  console.log('ZENTEC ->', res1);

  const res2 = await resolveInstrumentFromText('Zen Technologies');
  console.log('Zen Technologies ->', res2);

  const res3 = await resolveInstrumentFromText('ADF FOODS');
  console.log('ADF FOODS ->', res3);
}

test().catch(console.error);
