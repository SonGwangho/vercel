import { randomUUID, createHash } from "node:crypto";
import { Client } from "@neondatabase/serverless";
import WebSocket from "ws";
import { MemoryLounge, LoungeError } from "./memory";
import { loungeChannels } from "../../lounge/shared";
import type { LoungeSocketOperation, LoungeSocketResult, LoungeRelayEnvelope, LoungeRelayPart, LoungeRelayAssembly, LoungeRelayPending, LoungeReplica } from "../../types/LoungeSocket";

export class LoungeRelay {
  readonly id = randomUUID();
  readonly rooms = new Map<string, MemoryLounge>();
  private leaders = new Set<string>();
  private replicaAt = new Map<string, number>();
  private publishedAt = new Map<string, number>();
  private checkpointAt = new Map<string, number>();
  private claiming = new Map<string, Promise<boolean>>();
  private releasing = new Map<string, Promise<void>>();
  private replies = new Map<string, { at: number; envelope: LoungeRelayEnvelope }>();
  private client: Client | null = null;
  private opening: Promise<void> | null = null;
  private pending = new Map<string, LoungeRelayPending>();
  private parts = new Map<string, LoungeRelayAssembly>();
  private queue: LoungeRelayEnvelope[] = [];
  private states = new Map<string, LoungeRelayEnvelope>();
  private flushing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private channel: string;

  constructor(private databaseUrl: string, private scope: string, private changed: (room: MemoryLounge) => void, private failed: () => void) {
    this.channel = `lounge_${createHash("sha256").update(scope).digest("hex").slice(0, 20)}`;
  }

  async ready() {
    if (this.stopped) throw new LoungeError("실시간 연결을 다시 열어 주세요.", 503);
    if (this.opening) return this.opening;
    this.opening = (async () => {
      if (!this.databaseUrl) throw new LoungeError("실시간 서버 연결 설정이 없습니다.", 503);
      const url = new URL(this.databaseUrl);
      // Session locks and LISTEN need a direct, session-bound connection rather than PgBouncer.
      url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
      const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 8000, query_timeout: 8000, statement_timeout: 5000 });
      client.neonConfig.webSocketConstructor = WebSocket;
      client.on("error", () => this.connectionLost());
      client.on("end", () => { if (!this.stopped) this.connectionLost(); });
      client.on("notification", (notification) => { if (notification.payload) this.receive(notification.payload); });
      await client.connect();
      this.client = client;
      await client.query("CREATE TABLE IF NOT EXISTS lounge_realtime_checkpoints (scope text NOT NULL, channel_id text NOT NULL, replica jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (scope, channel_id))");
      await client.query(`LISTEN ${this.channel}`);
      // Existing leaders publish their current memory state when a new instance arrives.
      await client.query("SELECT pg_notify($1, $2)", [this.channel, JSON.stringify({ hello: this.id })]);
    })().catch((error) => { this.opening = null; this.connectionLost(); throw error; });
    return this.opening;
  }

  private connectionLost() {
    if (this.stopped) return;
    this.stopped = true; this.leaders.clear();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new LoungeError("실시간 연결을 다시 확인하고 있어요.", 503)); }
    this.pending.clear(); this.failed();
    const client = this.client; this.client = null;
    if (client) void client.end().catch(() => {});
  }

  private async claim(channelId: string): Promise<boolean> {
    await this.releasing.get(channelId);
    if (this.leaders.has(channelId)) return true;
    const existing = this.claiming.get(channelId); if (existing) return existing;
    const promise = (async () => {
      await this.ready();
      const key = createHash("sha256").update(`${this.scope}:${channelId}`).digest().readInt32BE(0);
      const result = await this.client!.query("SELECT pg_try_advisory_lock($1::int, $2::int) AS acquired", [15325477, key]);
      if (result.rows[0]?.acquired) {
        let saved;
        try { saved = await this.client!.query("SELECT replica FROM lounge_realtime_checkpoints WHERE scope = $1 AND channel_id = $2 AND updated_at > now() - interval '5 minutes'", [this.scope, channelId]); }
        catch (error) { await this.client?.query("SELECT pg_advisory_unlock($1::int, $2::int)", [15325477, key]).catch(() => {}); throw error; }
        const replica = saved.rows[0]?.replica as LoungeReplica | undefined;
        const current = this.rooms.get(channelId);
        if (replica && (!current || (current.epoch === replica.epoch && current.revision < replica.revision))) this.rooms.set(channelId, new MemoryLounge(channelId, replica));
        this.leaders.add(channelId);
        if (!this.rooms.has(channelId)) this.rooms.set(channelId, new MemoryLounge(channelId));
        this.replicate(this.rooms.get(channelId)!);
        return true;
      }
      return false;
    })();
    this.claiming.set(channelId, promise);
    try { return await promise; } finally { this.claiming.delete(channelId); }
  }

  private channelId(operation: LoungeSocketOperation) { return operation.op === "join" ? operation.input.channelId : operation.session.channelId; }

  async run(operation: LoungeSocketOperation): Promise<LoungeSocketResult> {
    const channelId = this.channelId(operation);
    if (!loungeChannels.some((room) => room.id === channelId)) throw new LoungeError("없는 캠핑장이에요.", 404);
    await this.ready();
    await this.releasing.get(channelId);
    if (this.leaders.has(channelId) || (Date.now() - (this.replicaAt.get(channelId) ?? 0) > 6000 && await this.claim(channelId))) return this.execute(operation);
    const id = randomUUID();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const result = new Promise<LoungeSocketResult>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new LoungeError("실시간 응답이 늦어지고 있어요. 다시 시도해 주세요.", 503)); }, 9000);
      this.pending.set(id, { resolve, reject, timer });
      const attempt = async () => {
        if (!this.pending.has(id) || this.stopped) return;
        try {
          // NOTIFY is transient; retry the same request through a leader handoff.
          if (Date.now() - (this.replicaAt.get(channelId) ?? 0) > 2500 && await this.claim(channelId)) {
            if (!this.pending.has(id)) return;
            const value = this.execute(operation);
            clearTimeout(timer); this.pending.delete(id); resolve(value); return;
          }
          this.publish({ kind: "request", source: this.id, id, operation });
        } catch (error) {
          clearTimeout(timer); this.pending.delete(id); reject(error); return;
        }
        if (this.pending.has(id)) retry = setTimeout(() => void attempt(), 750);
      };
      void attempt();
    });
    try { return await result; }
    finally { if (retry) clearTimeout(retry); }
  }

  private execute(operation: LoungeSocketOperation): LoungeSocketResult {
    const room = this.rooms.get(this.channelId(operation))!;
    const revision = room.revision;
    let result: LoungeSocketResult;
    if (operation.op === "join") result = room.join(operation.input, operation.token);
    else if (operation.op === "resume") result = room.read(operation.session);
    else if (operation.op === "touch") result = room.touch(operation.session, operation.activity);
    else result = room.command(operation.session, operation.command);
    if (revision !== room.revision) { this.changed(room); this.replicate(room); }
    return result;
  }

  tick() {
    for (const id of this.leaders) {
      if (this.releasing.has(id)) continue;
      const room = this.rooms.get(id)!; const revision = room.revision;
      room.tick(); if (room.revision !== revision) { this.changed(room); this.replicate(room); }
      else if (Date.now() - (this.publishedAt.get(id) ?? 0) > 4000) this.replicate(room);
      if (Date.now() - (this.checkpointAt.get(id) ?? 0) > 10000) { this.checkpointAt.set(id, Date.now()); void this.checkpoint(room).catch(() => {}); }
    }
    const now = Date.now();
    for (const [id, entry] of this.parts) if (now - entry.createdAt > 15000) this.parts.delete(id);
    for (const [id, reply] of this.replies) if (now - reply.at > 15000) this.replies.delete(id);
  }

  async release(channelId: string) {
    const pending = this.releasing.get(channelId); if (pending) return pending;
    if (!this.leaders.has(channelId) || !this.client) return;
    const release = this.releaseRoom(channelId).catch((error) => { this.connectionLost(); throw error; });
    this.releasing.set(channelId, release);
    try { await release; } finally { this.releasing.delete(channelId); }
  }

  private async releaseRoom(channelId: string) {
    const room = this.rooms.get(channelId)!;
    await this.checkpoint(room);
    this.publish({ kind: "release", source: this.id, channelId, replica: room.replica() });
    while (!this.stopped && (this.flushing || this.queue.length || this.states.size)) { await this.flush(); if (this.flushing) await new Promise((resolve) => setTimeout(resolve, 10)); }
    this.leaders.delete(channelId);
    const key = createHash("sha256").update(`${this.scope}:${channelId}`).digest().readInt32BE(0);
    await this.client?.query("SELECT pg_advisory_unlock($1::int, $2::int)", [15325477, key]);
  }

  async takeOver(channelId: string) { if (!this.leaders.has(channelId) && Date.now() - (this.replicaAt.get(channelId) ?? 0) > 6000 && await this.claim(channelId)) this.changed(this.rooms.get(channelId)!); }
  private async checkpoint(room: MemoryLounge) {
    if (!this.client || this.stopped) return;
    await this.client.query("INSERT INTO lounge_realtime_checkpoints (scope, channel_id, replica) VALUES ($1, $2, $3::jsonb) ON CONFLICT (scope, channel_id) DO UPDATE SET replica = EXCLUDED.replica, updated_at = now() WHERE (lounge_realtime_checkpoints.replica->>'epoch') IS DISTINCT FROM (EXCLUDED.replica->>'epoch') OR (lounge_realtime_checkpoints.replica->>'revision')::bigint <= (EXCLUDED.replica->>'revision')::bigint", [this.scope, room.channelId, JSON.stringify(room.replica())]);
  }
  private replicate(room: MemoryLounge) { this.publishedAt.set(room.channelId, Date.now()); this.publish({ kind: "state", source: this.id, replica: room.replica() }); }
  private publish(envelope: LoungeRelayEnvelope) {
    if (this.stopped) return;
    if (envelope.kind === "state") this.states.set(envelope.replica.channelId, envelope);
    else this.queue.push(envelope);
    if (!this.flushTimer && !this.flushing) this.flushTimer = setTimeout(() => { this.flushTimer = null; void this.flush(); }, 2);
  }

  private async flush() {
    if (this.flushing || !this.client || (!this.queue.length && !this.states.size)) return;
    this.flushing = true;
    const envelopes = [...this.states.values(), ...this.queue]; this.states.clear(); this.queue = [];
    const data = Buffer.from(JSON.stringify(envelopes)).toString("base64");
    const pieces = data.match(/.{1,5800}/g) ?? [];
    const id = randomUUID();
    const payloads = pieces.map((part, index) => JSON.stringify({ source: this.id, id, index, total: pieces.length, data: part } satisfies LoungeRelayPart));
    try { await this.client.query("SELECT pg_notify($1, chunk) FROM jsonb_array_elements_text($2::jsonb) AS messages(chunk)", [this.channel, JSON.stringify(payloads)]); }
    catch { this.connectionLost(); }
    finally {
      this.flushing = false;
      if (!this.stopped && (this.queue.length || this.states.size)) this.flushTimer = setTimeout(() => { this.flushTimer = null; void this.flush(); }, 0);
    }
  }

  private receive(payload: string) {
    try {
      const part = JSON.parse(payload) as LoungeRelayPart & { hello?: string };
      if (part.hello) { if (part.hello !== this.id) for (const id of this.leaders) this.replicate(this.rooms.get(id)!); return; }
      if (part.source === this.id || !part.id || !Number.isInteger(part.index) || part.total < 1 || part.total > 256 || part.index < 0 || part.index >= part.total || typeof part.data !== "string") return;
      let assembly = this.parts.get(part.id);
      if (!assembly) { if (this.parts.size > 128) return; assembly = { parts: [], total: part.total, received: 0, createdAt: Date.now() }; this.parts.set(part.id, assembly); }
      if (assembly.parts[part.index] !== undefined) return;
      assembly.parts[part.index] = part.data; assembly.received += 1;
      if (assembly.received !== assembly.total) return;
      this.parts.delete(part.id);
      const messages = JSON.parse(Buffer.from(assembly.parts.join(""), "base64").toString("utf8")) as LoungeRelayEnvelope[];
      for (const message of messages) this.message(message);
    } catch { /* Ignore incomplete or invalid pub/sub frames. */ }
  }

  private restore(replica: LoungeReplica) {
    this.replicaAt.set(replica.channelId, Date.now());
    const existing = this.rooms.get(replica.channelId);
    if (existing && existing.epoch === replica.epoch && existing.revision >= replica.revision) return;
    if (existing) existing.restore(replica); else this.rooms.set(replica.channelId, new MemoryLounge(replica.channelId, replica));
    this.changed(this.rooms.get(replica.channelId)!);
  }

  private message(message: LoungeRelayEnvelope) {
    if (message.kind === "state") { if (!this.leaders.has(message.replica.channelId)) this.restore(message.replica); }
    else if (message.kind === "release") { if (!this.leaders.has(message.channelId)) { this.restore(message.replica); this.replicaAt.set(message.channelId, 0); } }
    else if (message.kind === "result" && message.target === this.id) {
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new LoungeError(message.error.message, message.error.status)); else if (message.result) pending.resolve(message.result);
    } else if (message.kind === "request" && this.leaders.has(this.channelId(message.operation)) && !this.releasing.has(this.channelId(message.operation))) {
      const key = `${message.source}:${message.id}`;
      const previous = this.replies.get(key);
      if (previous) { this.publish(previous.envelope); return; }
      let envelope: LoungeRelayEnvelope;
      try {
        const result = this.execute(message.operation);
        envelope = { kind: "result", target: message.source, id: message.id, result: "players" in result && message.operation.op !== "resume" ? { applied: true, channelId: result.channel.id, epoch: result.epoch, revision: result.revision } : result };
      }
      catch (error) { envelope = { kind: "result", target: message.source, id: message.id, error: { status: error instanceof LoungeError ? error.status : 503, message: error instanceof LoungeError ? error.message : "행동을 처리하지 못했어요." } }; }
      if (this.replies.size >= 512) this.replies.delete(this.replies.keys().next().value!);
      this.replies.set(key, { at: Date.now(), envelope });
      this.publish(envelope);
    }
  }

  async close() {
    this.stopped = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new LoungeError("연결이 닫혔어요.", 503)); }
    this.pending.clear(); const client = this.client; this.client = null;
    if (client) await client.end().catch(() => {});
  }
}
