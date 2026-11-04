import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { build } from "esbuild";

// A session-bound Postgres transport double: no database credentials or external service.
let database;
class TestClient extends EventEmitter {
  neonConfig = {};
  constructor() { super(); this.db = database; this.db.clients.add(this); }
  async connect() {}
  async end() {
    this.db.clients.delete(this);
    for (const [key, owner] of this.db.locks) if (owner === this) this.db.locks.delete(key);
    this.emit("end");
  }
  async query(sql, args = []) {
    if (sql.startsWith("CREATE TABLE")) return { rows: [] };
    if (sql.startsWith("LISTEN")) { this.channel = sql.slice(7); return { rows: [] }; }
    if (sql.includes("pg_try_advisory_lock")) {
      const owner = this.db.locks.get(args[1]);
      if (!owner || owner === this) { this.db.locks.set(args[1], this); return { rows: [{ acquired: true }] }; }
      return { rows: [{ acquired: false }] };
    }
    if (sql.includes("pg_advisory_unlock")) { if (this.db.locks.get(args[1]) === this) this.db.locks.delete(args[1]); return { rows: [] }; }
    if (sql.startsWith("SELECT replica")) { const replica = this.db.saved.get(`${args[0]}:${args[1]}`); return { rows: replica ? [{ replica: structuredClone(replica) }] : [] }; }
    if (sql.startsWith("INSERT INTO")) {
      await this.db.holdCheckpoint?.();
      this.db.saved.set(`${args[0]}:${args[1]}`, JSON.parse(args[2])); return { rows: [] };
    }
    if (sql.includes("pg_notify")) {
      let payloads, envelopes = [];
      if (sql.includes("jsonb_array_elements_text")) {
        payloads = JSON.parse(args[1]);
        envelopes = JSON.parse(Buffer.from(payloads.map((payload) => JSON.parse(payload).data).join(""), "base64").toString());
      } else payloads = [args[1]];
      if (!this.db.drop?.(envelopes)) for (const client of this.db.clients) if (client.channel === args[0]) {
        for (const payload of payloads) queueMicrotask(() => client.emit("notification", { payload }));
      }
      return { rows: [] };
    }
    throw new Error(`Unhandled test query: ${sql}`);
  }
}
globalThis.__loungeTestClient = TestClient;
const output = resolve(".svelte-kit/lounge-tests/bundle.mjs");
await mkdir(resolve(".svelte-kit/lounge-tests"), { recursive: true });
await build({
  stdin: { contents: `export { MemoryLounge } from './src/lib/server/lounge/memory'; export { LoungeRelay } from './src/lib/server/lounge/relay'; export { LoungeSocket } from './src/lib/client/loungeSocket'; export { diffLounge, mergeLounge } from './src/lib/lounge/protocol';`, resolveDir: process.cwd() },
  outfile: output, bundle: true, platform: "node", format: "esm", packages: "external",
  alias: { $lib: resolve("src/lib") },
  plugins: [{ name: "test-database", setup(plugin) {
    plugin.onResolve({ filter: /^@neondatabase\/serverless$/ }, () => ({ path: "neon", namespace: "test" }));
    plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: "export const Client = globalThis.__loungeTestClient;" }));
  } }]
});
const { MemoryLounge, LoungeRelay, LoungeSocket, diffLounge, mergeLounge } = await import(pathToFileURL(output).href);
delete globalThis.__loungeTestClient;
const input = (nickname = "테스터") => ({ channelId: "1", nickname, color: "#4778d8" });
const token = "a".repeat(64);
const drain = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };

function relays(t) {
  database = { clients: new Set(), locks: new Map(), saved: new Map() };
  const instances = [];
  t.after(async () => { for (const relay of instances) await relay.close(); });
  return () => {
    const relay = new LoungeRelay("postgresql://test:dummy@localhost/test", "test-scope", () => {}, () => {});
    instances.push(relay); return relay;
  };
}

test("lost join responses reuse the same session, also after checkpoint restore", () => {
  const room = new MemoryLounge("1");
  const joined = room.join(input(), token);
  const restored = new MemoryLounge("1", room.replica());
  const retry = restored.join(input(), token);
  assert.deepEqual(retry.session, joined.session);
  assert.equal(retry.snapshot.players.length, 1);
  assert.equal("tokenHash" in retry.snapshot.players[0], false);
  assert.throws(() => room.join(input(), "short"), { status: 400 });
});

test("replayed actions and moves do not run twice", () => {
  const room = new MemoryLounge("1");
  const { session } = room.join(input());
  const command = { type: "chat", text: "안녕하세요", commandId: crypto.randomUUID() };
  room.command(session, command); const revision = room.revision;
  room.command(session, command);
  assert.equal(room.revision, revision); assert.equal(room.state.messages.length, 1);
  const move = { type: "move", x: 1100, y: 1200, commandId: crypto.randomUUID() };
  room.command(session, move); const path = room.snapshot().players[0].move;
  room.command(session, move); assert.deepEqual(room.snapshot().players[0].move, path);
  for (let i = 0; i < 140; i += 1) room.command(session, { ...move, commandId: crypto.randomUUID() });
  room.command(session, command);
  assert.equal(room.state.messages.length, 1, "movement must not evict action retry history");
  assert.equal("lastMoveCommandId" in room.snapshot().players[0], false);
});

test("idle maintenance skips room clones but still expires timed state", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const room = new MemoryLounge("1"); room.join(input());
  const mutation = t.mock.method(room, "mutate");
  room.tick();
  for (let i = 0; i < 100; i += 1) { t.mock.timers.tick(100); room.tick(); }
  assert.equal(mutation.mock.callCount(), 1);
  t.mock.timers.tick(35001); room.tick();
  assert.equal(room.state.players.length, 0);
});

test("patches require the exact room, epoch, and baseline", () => {
  const room = new MemoryLounge("1"); const { session, snapshot: before } = room.join(input());
  const after = room.command(session, { type: "chat", text: "반가워요", commandId: crypto.randomUUID() });
  const patch = diffLounge(before, after);
  assert.deepEqual(mergeLounge(before, patch), after);
  assert.equal(mergeLounge(before, { ...patch, baseRevision: 0 }), before);
  assert.equal(mergeLounge(before, { ...patch, channelId: "2" }), before);
  assert.equal(mergeLounge(before, { ...patch, epoch: "other" }), before);
});

test("a dropped inter-instance request is retransmitted", async (t) => {
  const create = relays(t), leader = create(), follower = create();
  await leader.run({ op: "join", input: input("주인") });
  await follower.ready(); await delay(20);
  let dropped = false;
  database.drop = (envelopes) => {
    if (!dropped && envelopes.some((entry) => entry.kind === "request")) { dropped = true; return true; }
    return false;
  };
  const result = await follower.run({ op: "join", input: input("손님"), token });
  assert.equal(dropped, true); assert.equal(result.snapshot.players.length, 2);
});

test("a dropped result reuses the reply without duplicating even a legacy join", async (t) => {
  const create = relays(t), leader = create(), follower = create();
  await leader.run({ op: "join", input: input("주인") });
  await follower.ready(); await delay(20);
  let dropped = false;
  database.drop = (envelopes) => {
    if (!dropped && envelopes.some((entry) => entry.kind === "result")) { dropped = true; return true; }
    return false;
  };
  const result = await follower.run({ op: "join", input: input("손님") });
  assert.equal(dropped, true); assert.equal(result.snapshot.players.length, 2);
  assert.equal(leader.rooms.get("1").state.players.length, 2);
});

test("a request survives a leader release between claim and notification", async (t) => {
  const create = relays(t), leader = create(), follower = create();
  await leader.run({ op: "join", input: input("주인") });
  await follower.ready(); await delay(20);
  let release;
  database.drop = (envelopes) => {
    if (!release && envelopes.some((entry) => entry.kind === "request")) { release = leader.release("1"); return true; }
    return false;
  };
  const result = await follower.run({ op: "join", input: input("손님"), token });
  await release;
  assert.equal(result.snapshot.players.length, 2);
  assert.equal(follower.rooms.get("1").state.players.length, 2);
});

test("commands wait for an in-progress checkpoint and lock release", async (t) => {
  const create = relays(t), relay = create();
  const { session } = await relay.run({ op: "join", input: input() });
  let unblock;
  database.holdCheckpoint = () => new Promise((resolve) => { unblock = resolve; });
  const release = relay.release("1"); await drain();
  const command = relay.run({ op: "command", session, command: { type: "chat", text: "보존해요", commandId: crypto.randomUUID() } });
  await drain(); assert.equal(relay.rooms.get("1").state.messages.length, 0);
  database.holdCheckpoint = null; unblock(); await release;
  const result = await command;
  assert.equal(result.messages.length, 1);
});

function browser(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: Date.now() });
  const room = new MemoryLounge("1"); const sockets = []; let intercept;
  class Socket {
    static OPEN = 1;
    readyState = 0;
    constructor() { sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.onopen?.(); }); }
    frame(frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
    close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; this.onclose?.({ code }); }
    send(data) {
      const request = JSON.parse(data);
      if (intercept?.(this, request)) return;
      if (request.op === "ping") { this.frame({ type: "pong", serverNow: Date.now(), sentAt: request.sentAt }); return; }
      try {
        if (request.op === "join") this.frame({ type: "result", id: request.id, result: room.join(request.input, request.token) });
        else if (request.op === "resume") this.frame({ type: "result", id: request.id, result: room.read(request.session) });
        else if (request.op === "channels") this.frame({ type: "result", id: request.id, result: { channels: [] } });
        else {
          const snapshot = request.op === "command" ? room.command(request.session, request.command) : room.touch(request.session, request.activity);
          this.frame({ type: "snapshot", snapshot }); this.frame({ type: "ack", id: request.id, serverNow: Date.now() });
        }
      } catch (error) { this.frame({ type: "error", id: request.id, status: error.status, message: error.message }); }
    }
  }
  const globals = { WebSocket: Socket, location: { href: "https://example.test/lounge", protocol: "https:" }, fetch: async () => ({ ok: true, json: async () => ({ ticket: "test" }) }), requestAnimationFrame: (fn) => setTimeout(fn, 16), cancelAnimationFrame: clearTimeout };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  }
  const client = new LoungeSocket();
  return { client, room, sockets, intercept: (fn) => { intercept = fn; } };
}

test("client retries a lost join response with the same secret and one player", async (t) => {
  const b = browser(t); let firstSession;
  b.intercept((socket, request) => {
    if (request.op === "join" && !firstSession) { firstSession = b.room.join(request.input, request.token).session; socket.close(1006); return true; }
  });
  const joined = await b.client.join(input());
  assert.deepEqual(joined.session, firstSession); assert.equal(b.room.state.players.length, 1);
  assert.equal(b.sockets.length, 2);
});

test("client retries an applied action after losing its acknowledgement only once", async (t) => {
  const b = browser(t); const { session } = await b.client.join(input()); let lost = false;
  b.intercept((socket, request) => {
    if (request.op === "command" && !lost) { lost = true; b.room.command(session, request.command); socket.close(1006); return true; }
  });
  const result = await b.client.command(session, { type: "chat", text: "한 번만", commandId: crypto.randomUUID() });
  assert.equal(result.messages.length, 1); assert.equal(b.room.state.messages.length, 1);
});

test("manual retry after two lost join replies still recovers the original player", async (t) => {
  const b = browser(t); let dropped = 0; let original;
  b.intercept((socket, request) => {
    if (request.op === "join" && dropped < 2) {
      original = b.room.join(request.input, request.token).session; dropped++;
      socket.close(1006); return true;
    }
  });
  await assert.rejects(b.client.join(input()), { status: 503 });
  const retried = await b.client.join(input());
  assert.deepEqual(retried.session, original); assert.equal(b.room.state.players.length, 1);
});

test("abandoning the entrance closes its idle socket", async (t) => {
  const b = browser(t); await b.client.channels();
  b.client.disconnectIdle();
  assert.equal(b.sockets[0].readyState, 3); assert.equal(b.client.pending.size, 0);
});

test("silent open sockets are detected and resumed", async (t) => {
  const b = browser(t); const { session } = await b.client.join(input());
  const statuses = [];
  b.client.subscribe({ onState() {}, onClock() {}, onExpired() {}, onStatus: (status) => statuses.push(status) });
  b.intercept((socket) => socket === b.sockets[0]);
  for (let i = 0; i < 3; i += 1) { t.mock.timers.tick(10000); await drain(); }
  assert.equal(b.sockets[0].readyState, 3);
  t.mock.timers.tick(1000); await drain();
  assert.equal(b.sockets.length, 2); assert.equal(statuses.at(-1), "connected");
  assert.ok(statuses.includes("reconnecting")); assert.equal((await b.client.resume(session)).players.length, 1);
});

test("a missing delta forces full resynchronization", async (t) => {
  const b = browser(t); const joined = await b.client.join(input());
  const next = b.room.command(joined.session, { type: "chat", text: "복구", commandId: crypto.randomUUID() });
  b.sockets[0].frame({ type: "patch", patch: { ...diffLounge(joined.snapshot, next), baseRevision: -1 } });
  assert.equal(b.sockets[0].readyState, 3);
  t.mock.timers.tick(1000); await drain();
  assert.equal((await b.client.resume(joined.session)).messages.length, 1);
});

test("aborted channel requests clean up without cancelling the active session", async (t) => {
  const b = browser(t); const { session } = await b.client.join(input());
  b.intercept((_socket, request) => request.op === "channels");
  const controller = new AbortController(); const channels = b.client.channels(controller.signal);
  await drain(); controller.abort();
  await assert.rejects(channels, { name: "AbortError" });
  assert.equal(b.client.pending.size, 0); assert.equal(b.sockets[0].readyState, 1);
  assert.equal((await b.client.resume(session)).players.length, 1);
});

test("an expired client can enter again and publish connected status", async (t) => {
  const b = browser(t); await b.client.join(input());
  b.sockets[0].frame({ type: "error", status: 401, message: "만료" });
  const statuses = [];
  b.client.subscribe({ onState() {}, onClock() {}, onExpired() {}, onStatus: (status) => statuses.push(status) });
  const joined = await b.client.join(input("다시입장"));
  assert.ok(joined.session); assert.equal(statuses.at(-1), "connected");
});
