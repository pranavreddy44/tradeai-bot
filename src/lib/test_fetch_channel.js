// use native fetch

async function main() {
  const channelId = '@luxurywithtrading';
  console.log(`Fetching test-channel for ${channelId}...`);
  try {
    const res = await fetch('http://localhost:3002/test-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    });
    const data = await res.json();
    console.log('Result:');
    console.log(JSON.stringify(data, null, 2).substring(0, 1500));
  } catch (err) {
    console.error(err);
  }
}

main();
