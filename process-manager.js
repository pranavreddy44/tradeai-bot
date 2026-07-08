// ============================================================
// Process Manager for TradeAI
// Starts and auto-restarts the Next.js server and mini-services
// when they crash. This is needed because the Next.js Turbopack
// dev server has memory stability issues in this environment.
// ============================================================

const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const NEXT_DIR = process.cwd();
const LOG_FILE = path.join(NEXT_DIR, 'dev.log');
const MINI_SERVICE_DIR = path.join(NEXT_DIR, 'mini-services', 'telegram-listener');

let nextProcess = null;
let miniProcess = null;
let logStream = null;

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [PM] ${message}\n`;
  process.stdout.write(line);
  if (logStream) logStream.write(line);
}

function startLog() {
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
}

// ─── Telegram Mini-Service ────────────────────────────────

function startMiniService() {
  if (isPortInUse(3002)) {
    log('Telegram mini-service already running on port 3002');
    return;
  }

  log('Starting Telegram mini-service on port 3002...');
  miniProcess = spawn('bun', ['index.ts'], {
    cwd: MINI_SERVICE_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  miniProcess.stdout.on('data', (data) => {
    if (logStream) logStream.write(data);
  });
  miniProcess.stderr.on('data', (data) => {
    if (logStream) logStream.write(data);
  });

  miniProcess.on('exit', (code, signal) => {
    log(`Telegram mini-service exited with code=${code} signal=${signal}`);
    miniProcess = null;
    // Restart after 5 seconds
    setTimeout(startMiniService, 5000);
  });

  log('Telegram mini-service started');
}

// ─── Next.js Dev Server ──────────────────────────────────

function startNextDev() {
  if (nextProcess) {
    log('Killing existing Next.js process...');
    nextProcess.kill('SIGTERM');
    nextProcess = null;
  }

  // Clear stale cache
  try {
    execSync(`rm -rf ${JSON.stringify(path.join(NEXT_DIR, '.next'))}`, { stdio: 'ignore' });
  } catch (e) {}

  log('Starting Next.js dev server on port 3000...');
  nextProcess = spawn('node', ['node_modules/.bin/next', 'dev', '-p', '3000'], {
    cwd: NEXT_DIR,
    env: {
      ...process.env,
      NODE_OPTIONS: '--max-old-space-size=4096',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  nextProcess.stdout.on('data', (data) => {
    if (logStream) logStream.write(data);
  });
  nextProcess.stderr.on('data', (data) => {
    if (logStream) logStream.write(data);
  });

  nextProcess.on('exit', (code, signal) => {
    log(`Next.js dev server exited with code=${code} signal=${signal}`);
    nextProcess = null;
    // Restart after 5 seconds
    setTimeout(startNextDev, 5000);
  });

  log('Next.js dev server started');
}

// ─── Next.js Production Server ────────────────────────────

function startNextProd() {
  if (nextProcess) {
    log('Killing existing Next.js process...');
    nextProcess.kill('SIGTERM');
    nextProcess = null;
  }

  log('Starting Next.js production server on port 3000...');
  nextProcess = spawn('node', ['.next/standalone/server.js'], {
    cwd: NEXT_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3000',
      HOSTNAME: '0.0.0.0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  nextProcess.stdout.on('data', (data) => {
    if (logStream) logStream.write(data);
  });
  nextProcess.stderr.on('data', (data) => {
    if (logStream) logStream.write(data);
  });

  nextProcess.on('exit', (code, signal) => {
    log(`Next.js production server exited with code=${code} signal=${signal}`);
    nextProcess = null;
    // Restart after 3 seconds
    setTimeout(startNextProd, 3000);
  });

  log('Next.js production server started');
}

// ─── Utility ──────────────────────────────────────────────

function isPortInUse(port) {
  try {
    const result = execSync(`lsof -i :${port} 2>/dev/null || true`).toString();
    return result.includes('LISTEN');
  } catch (e) {
    return false;
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/', { timeout: 5000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] || 'dev'; // 'dev' or 'prod'
  
  // Clear log
  fs.writeFileSync(LOG_FILE, '');
  startLog();
  
  log(`=== TradeAI Process Manager (${mode} mode) ===`);

  // Kill any existing processes
  try { execSync('pkill -f "next-server" 2>/dev/null || true'); } catch (e) {}
  try { execSync('pkill -f "next dev" 2>/dev/null || true'); } catch (e) {}
  try { execSync('pkill -f "standalone/server" 2>/dev/null || true'); } catch (e) {}

  // Start mini-service
  startMiniService();
  
  // Wait a bit for mini-service to start
  await new Promise(r => setTimeout(r, 3000));

  // Start Next.js
  if (mode === 'prod') {
    startNextProd();
  } else {
    startNextDev();
  }

  // Health check loop
  setInterval(async () => {
    const healthy = await healthCheck();
    if (!healthy && !nextProcess) {
      log('Health check failed and no process running, restarting...');
      if (mode === 'prod') {
        startNextProd();
      } else {
        startNextDev();
      }
    }
  }, 30000);

  // Keep process alive
  process.on('SIGINT', () => {
    log('Shutting down...');
    if (nextProcess) nextProcess.kill();
    if (miniProcess) miniProcess.kill();
    process.exit(0);
  });
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
