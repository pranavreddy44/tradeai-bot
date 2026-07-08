async function main() {
  console.log('Triggering Telegram scan via API...');
  try {
    const res = await fetch('http://localhost:3000/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan-messages' }),
    });
    const data = await res.json();
    console.log('API Response status:', res.status);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

main();
