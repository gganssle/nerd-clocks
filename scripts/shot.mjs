// Screenshot a page with headless Chrome over the DevTools protocol (Node 22+, no deps).
// usage: node shot.mjs <url> <out.png> <W> <H> <waitMs>
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [url, out, W = '1920', H = '1080', wait = '3000'] = process.argv.slice(2);
const port = 9400 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'f2c-'));
const bin = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome = spawn(bin, [
  '--headless=new', `--user-data-dir=${prof}`, '--no-first-run', `--remote-debugging-port=${port}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 100; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); } }
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const logs = [];
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } else if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') logs.push(JSON.stringify(msg.params).slice(0, 400)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(+wait);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
if (logs.length) console.log(logs.join('\n'));
ws.close(); chrome.kill('SIGKILL'); await sleep(300); try { rmSync(prof, { recursive: true, force: true }); } catch {}
console.log(out);
process.exit(0);
