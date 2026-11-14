import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const profileDir = 'C:\\Users\\MASTERCORE\\.gemini\\temp-chrome-profile2';
try {
  rmSync(profileDir, { recursive: true, force: true });
} catch {}
mkdirSync(profileDir, { recursive: true });

const chrome = spawn(
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/login',
  ],
  { stdio: 'ignore' }
);

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  await wait(2000);

  let targets;
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      targets = await res.json();
      break;
    } catch {
      await wait(500);
    }
  }

  if (!targets || targets.length === 0) {
    console.error('Target tidak ditemukan');
    chrome.kill();
    return;
  }

  const page = targets.find((t) => t.type === 'page') || targets[0];
  console.log('Target Chrome:', page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);

  ws.onopen = () => {
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
    ws.send(JSON.stringify({ id: 2, method: 'Page.enable' }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') {
      console.log('🚨 EXCEPTION THROWN:');
      console.log(JSON.stringify(data.params.exceptionDetails, null, 2));
    } else if (data.method === 'Runtime.consoleAPICalled') {
      const type = data.params.type;
      const args = data.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      console.log(`[CONSOLE ${type.toUpperCase()}]: ${args}`);
    }
  };

  await wait(4000);

  ws.close();
  chrome.kill();
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {}
}

run().catch((err) => {
  console.error(err);
  chrome.kill();
});
