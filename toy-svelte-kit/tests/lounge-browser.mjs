// Run after `npm run build`. Uses a fresh headless browser profile and a local-only
// transport double; never connects to Neon or any signed-in browser/account.
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { Browser, sleep } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const directory = resolve(".svelte-kit/lounge-browser");
await mkdir(directory, { recursive: true });
const metrics = { moves: 0, inFlight: 0, maxInFlight: 0, connections: 0 };
globalThis.__loungeBrowserMetrics = metrics;
await build({
  stdin: { contents: `export { attachLoungeSockets } from './src/lib/server/lounge/socket'; export { createLoungeTicket } from './src/lib/server/lounge/ticket';`, resolveDir: process.cwd() },
  outfile: resolve(directory, "server.mjs"), bundle: true, platform: "node", format: "esm", packages: "external",
  plugins: [{ name: "local-room", setup(plugin) {
    plugin.onResolve({ filter: /^\.\/relay$/ }, () => ({ path: "relay", namespace: "test" }));
    plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `
      import { MemoryLounge } from ${JSON.stringify(resolve("src/lib/server/lounge/memory.ts"))};
      const rooms = new Map();
      export class LoungeRelay {
        rooms = rooms;
        constructor(_url, _scope, changed) { this.changed = changed; }
        async ready() {}
        async takeOver() {}
        async release() {}
        async close() {}
        tick() { for (const room of rooms.values()) { const revision = room.revision; room.tick(); if (revision !== room.revision) this.changed(room); } }
        async run(operation) {
          const channel = operation.op === 'join' ? operation.input.channelId : operation.session.channelId;
          if (!rooms.has(channel)) rooms.set(channel, new MemoryLounge(channel));
          const room = rooms.get(channel), metrics = globalThis.__loungeBrowserMetrics;
          const moving = operation.op === 'command' && operation.command.type === 'move';
          if (moving) { metrics.moves++; metrics.inFlight++; metrics.maxInFlight = Math.max(metrics.maxInFlight, metrics.inFlight); await new Promise((resolve) => setTimeout(resolve, 150)); }
          try {
            const result = operation.op === 'join' ? room.join(operation.input, operation.token) : operation.op === 'resume' ? room.read(operation.session) : operation.op === 'touch' ? room.touch(operation.session, operation.activity) : room.command(operation.session, operation.command);
            this.changed(room); return result;
          } finally { if (moving) metrics.inFlight--; }
        }
      }`, resolveDir: process.cwd() }));
  } }]
});
const { attachLoungeSockets, createLoungeTicket } = await import(pathToFileURL(resolve(directory, "server.mjs")).href);
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "5273", "--strictPort"], { stdio: "ignore", windowsHide: true });
const secret = "local-browser-test-secret";
const server = createServer((request, response) => {
  if (request.url === "/api/lounge/ticket") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ ticket: createLoungeTicket(secret) })); return; }
  const proxy = httpRequest({ hostname: "127.0.0.1", port: 5273, path: request.url, method: request.method, headers: request.headers }, (upstream) => {
    response.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(response);
  });
  proxy.on("error", () => { response.writeHead(502); response.end(); }); request.pipe(proxy);
});
const wss = attachLoungeSockets(server, { databaseUrl: "unused", secret, scope: "test" });
wss.on("connection", () => { metrics.connections++; });
let browser;
const waitFor = async (page, expression, message, ms = 25000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await page.eval(expression)) return; await sleep(100); }
  throw new Error(message);
};
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch("http://127.0.0.1:5273/lounge")).ok) break; } catch {}
    await sleep(250);
  }
  browser = await Browser.launch();
  const page = await browser.newPage({ width: 1440, height: 900 });
  await page.goto(`${base}/lounge`);
  await waitFor(page, `document.querySelector('.channel-count')?.textContent.includes('/ 16')`, "Channel count did not load");
  await waitFor(page, `!document.querySelector('.avatar-preview-loading')`, "Avatar preview did not load");
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 900 });
    await sleep(200);
    assert.equal(await page.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), true, `Entrance overflow at ${width}`);
    await page.screenshot({ path: resolve(directory, `entrance-${width}.jpg`) });
  }
  await page.setViewport({ width: 1440, height: 900 });
  await page.eval(`(() => { const input = document.querySelector('input[autocomplete="nickname"]'); input.value = '연결시험'; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('form').requestSubmit(); })()`);
  await waitFor(page, `location.pathname === '/lounge/1' && document.querySelector('.scene-name') && !document.querySelector('.game-cover')`, "Room did not become usable");
  await page.screenshot({ path: resolve(directory, "room-desktop.jpg") });

  // Real browser clicks with 150ms simulated server latency: one move can be in flight.
  await page.eval(`(() => { const host = document.querySelector('.lounge-scene-host'), rect = host.getBoundingClientRect(); for (let i = 0; i < 40; i++) setTimeout(() => { const point = { bubbles: true, button: 0, clientX: rect.left + rect.width * (.42 + i % 6 * .025), clientY: rect.top + rect.height * .66 }; host.dispatchEvent(new PointerEvent('pointerdown', point)); host.dispatchEvent(new PointerEvent('pointerup', point)); }, i * 20); })()`);
  await sleep(1800);
  assert.ok(metrics.moves > 0 && metrics.moves < 15, `Move coalescing failed: ${metrics.moves}`);
  assert.equal(metrics.maxInFlight, 1);

  const connections = metrics.connections;
  for (const socket of wss.clients) socket.terminate();
  await waitFor(page, `!document.querySelector('.game-live-dot.offline') && !document.querySelector('.game-cover')`, "Client failed to resume");
  await sleep(1000);
  assert.ok(metrics.connections > connections, "Socket did not reconnect");
  assert.ok(await page.eval(`document.querySelector('.scene-name')?.textContent.includes('연결시험')`));

  await page.eval(`(() => { const canvas = document.querySelector('.lounge-webgl'); window.testContext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context'); window.testContext.loseContext(); })()`);
  await waitFor(page, `document.querySelector('.game-cover')?.textContent.includes('복구')`, "Context loss was not surfaced");
  await sleep(1000); await page.eval(`window.testContext.restoreContext()`);
  await waitFor(page, `!document.querySelector('.game-cover')`, "WebGL did not restore");
  await page.eval(`document.documentElement.dataset.theme = 'dark'`);
  await page.setViewport({ width: 390, height: 844, mobile: true }); await sleep(300);
  assert.equal(await page.eval(`document.documentElement.scrollWidth <= innerWidth + 1`), true);
  await page.screenshot({ path: resolve(directory, "room-mobile-dark.jpg") });
  assert.deepEqual(page.consoleErrors, []);
  await writeFile(resolve(directory, "result.json"), JSON.stringify({ ...metrics, consoleErrors: page.consoleErrors, scenarios: ["entrance at 1440/768/390", "join", "coalesced movement at 150ms latency", "socket termination and resume", "WebGL context loss and restoration", "mobile dark theme"] }, null, 2));
  console.log(JSON.stringify({ status: "passed", ...metrics, screenshots: directory }));
} finally {
  if (browser) await browser.close();
  for (const socket of wss.clients) socket.terminate();
  server.close(); preview.kill(); delete globalThis.__loungeBrowserMetrics;
}
