import { LoungeClientError } from "./loungeError";
import { mergeLounge } from "$lib/lounge/protocol";
import type { LoungeCommand, LoungeJoinInput, LoungeJoinResult, LoungeRoomClientState, LoungeSession, LoungeSnapshot } from "$lib/types/Lounge";
import type { LoungeClientPending, LoungeSocketFrame, LoungeSocketHandlers, LoungeSocketOperation, LoungeSocketResult } from "$lib/types/LoungeSocket";

export class LoungeSocket {
  private socket: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private connectAbort: AbortController | null = null;
  private session: LoungeSession | null = null;
  private state: LoungeSnapshot | null = null;
  private handlers = new Set<LoungeSocketHandlers>();
  private pending = new Map<string, LoungeClientPending>();
  private status: LoungeRoomClientState = "connecting";
  private retry: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private render = 0;
  private activityAt = 0;
  private receivedAt = 0;
  private joining: { key: string; token: string } | null = null;

  subscribe(handlers: LoungeSocketHandlers) {
    this.handlers.add(handlers); handlers.onStatus(this.status);
    if (this.state) handlers.onState(this.state);
    return () => { this.handlers.delete(handlers); };
  }
  private setStatus(status: LoungeRoomClientState) {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.handlers) handler.onStatus(status);
  }
  private accept(snapshot: LoungeSnapshot) {
    if (this.state?.channel.id === snapshot.channel.id && this.state.epoch === snapshot.epoch && this.state.revision > snapshot.revision) return;
    this.state = snapshot;
    if (this.session?.channelId === snapshot.channel.id && !snapshot.players.some((player) => player.id === this.session?.playerId)) {
      this.expire("5분 동안 활동이 없어 캠핑장을 나왔어요. 다시 입장해 주세요."); return;
    }
    if (!this.render) this.render = requestAnimationFrame(() => {
      this.render = 0;
      if (this.state) for (const handler of this.handlers) handler.onState(this.state);
    });
  }
  private receive(frame: LoungeSocketFrame) {
    this.receivedAt = Date.now();
    if (frame.type === "pong") { for (const handler of this.handlers) handler.onClock(frame.serverNow, frame.sentAt); return; }
    if (frame.type === "snapshot") { this.accept(frame.snapshot); return; }
    if (frame.type === "patch") {
      if (this.state && frame.patch.channelId === this.state.channel.id && frame.patch.epoch === this.state.epoch && frame.patch.revision <= this.state.revision) return;
      if (!this.state || frame.patch.channelId !== this.state.channel.id || frame.patch.epoch !== this.state.epoch || frame.patch.baseRevision !== this.state.revision) {
        this.drop(); return; // Reload a full snapshot instead of silently merging a gap.
      }
      this.accept(mergeLounge(this.state, frame.patch)); return;
    }
    const pending = frame.id ? this.pending.get(frame.id) : undefined;
    if (frame.type === "result") {
      if ("snapshot" in frame.result) this.accept(frame.result.snapshot);
      else if ("players" in frame.result) this.accept(frame.result);
    }
    if (pending && frame.id) { pending.cleanup(); this.pending.delete(frame.id); }
    if (frame.type === "error") {
      pending?.reject(new LoungeClientError(frame.message, frame.status));
      if (frame.status === 401 && this.session) this.expire(frame.message);
      else if (frame.status >= 500) this.drop();
    } else pending?.resolve(frame.type === "result" ? frame.result : this.state);
  }
  private drop() {
    const socket = this.socket; this.socket = null;
    if (this.pingTimer) clearInterval(this.pingTimer); this.pingTimer = null;
    for (const pending of this.pending.values()) {
      pending.cleanup(); pending.reject(new LoungeClientError("연결이 끊겼어요. 다시 연결하고 있어요.", 503));
    }
    this.pending.clear(); socket?.close(); this.retrySoon();
  }
  private expire(message: string) {
    this.session = null; this.state = null; this.setStatus("expired");
    if (this.retry) clearTimeout(this.retry); this.retry = null;
    this.drop();
    for (const handler of this.handlers) handler.onExpired(message);
  }
  private retrySoon() {
    if (!this.session || this.retry) return;
    this.setStatus("reconnecting");
    this.retry = setTimeout(() => {
      this.retry = null; void this.connect().catch(() => this.retrySoon());
    }, Math.min(5000, 300 * 2 ** Math.min(this.attempts++, 4)) + Math.random() * 250);
  }
  private raw(operation: LoungeSocketOperation | { op: "channels" }, signal?: AbortSignal): Promise<LoungeSocketResult | null> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new LoungeClientError("연결을 다시 확인하고 있어요.", 503));
    const socket = this.socket;
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
      const abort = () => { cleanup(); this.pending.delete(id); reject(signal?.reason); };
      const timer = setTimeout(() => {
        cleanup(); this.pending.delete(id);
        reject(new LoungeClientError("응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.", 504)); this.drop();
      }, 12000);
      this.pending.set(id, { resolve, reject, timer, cleanup });
      signal?.addEventListener("abort", abort, { once: true });
      try { socket.send(JSON.stringify({ ...operation, id })); }
      catch { this.drop(); }
    });
  }
  async connect() {
    if (this.opening) return this.opening;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.setStatus(this.session ? "reconnecting" : "connecting");
    const controller = new AbortController(); this.connectAbort = controller;
    const opening = (async () => {
      const response = await fetch("/api/lounge/ticket", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ticket) throw new LoungeClientError(body?.message ?? "캠핑장에 연결하지 못했어요.", response.status || 503);
      controller.signal.throwIfAborted();
      const url = new URL("/api/lounge-socket", location.href);
      url.protocol = location.protocol === "https:" ? "wss:" : "ws:"; url.searchParams.set("ticket", body.ticket);
      const socket = new WebSocket(url); this.socket = socket;
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timeout); controller.signal.removeEventListener("abort", abort);
          if (error) reject(error); else resolve();
        };
        const abort = () => { socket.close(); finish(new LoungeClientError("연결을 취소했어요.", 503)); };
        const timeout = setTimeout(() => { socket.close(); finish(new LoungeClientError("캠핑장 연결 시간이 초과됐어요.", 503)); }, 10000);
        controller.signal.addEventListener("abort", abort, { once: true });
        socket.onopen = () => finish();
        socket.onerror = () => finish(new LoungeClientError("실시간 연결을 열지 못했어요. 잠시 후 다시 시도해 주세요.", 503));
        socket.onmessage = (event) => {
          if (this.socket !== socket) return;
          try { this.receive(JSON.parse(event.data)); } catch { this.drop(); }
        };
        socket.onclose = (event) => {
          finish(new LoungeClientError("연결이 끊겼어요. 다시 연결하고 있어요.", 503));
          if (this.socket !== socket) return;
          if (event.code === 4001 && this.session) this.expire("5분 동안 활동이 없어 캠핑장을 나왔어요.");
          else this.drop();
        };
      });
      if (this.session) await this.raw({ op: "resume", session: this.session });
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) throw new LoungeClientError("실시간 연결을 다시 열고 있어요.", 503);
      this.attempts = 0; this.receivedAt = Date.now(); this.setStatus("connected");
      if (this.retry) clearTimeout(this.retry); this.retry = null;
      const ping = () => {
        if (this.socket !== socket) return;
        if (Date.now() - this.receivedAt > 25000) { this.drop(); return; }
        try { socket.send(JSON.stringify({ op: "ping", id: crypto.randomUUID(), sentAt: Date.now() })); }
        catch { this.drop(); }
      };
      this.pingTimer = setInterval(ping, 10000); ping();
    })();
    this.opening = opening;
    try { await opening; }
    catch (error) {
      if (this.connectAbort === controller) this.drop();
      throw error instanceof LoungeClientError ? error : new LoungeClientError("캠핑장에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 503);
    } finally {
      if (this.opening === opening) this.opening = null;
      if (this.connectAbort === controller) this.connectAbort = null;
    }
  }
  private async send(operation: LoungeSocketOperation | { op: "channels" }, signal?: AbortSignal) {
    for (let attempt = 0; ; attempt += 1) {
      signal?.throwIfAborted();
      try { await this.connect(); return await this.raw(operation, signal); }
      catch (error) {
        if (signal?.aborted || attempt >= 1 || !(error instanceof LoungeClientError) || ![503, 504].includes(error.status)) throw error;
        this.drop();
      }
    }
  }
  async channels(signal?: AbortSignal) {
    const result = await this.send({ op: "channels" }, signal);
    if (!result || !("channels" in result)) throw new LoungeClientError("캠핑장 목록을 불러오지 못했어요.", 503);
    return result.channels;
  }
  async join(input: LoungeJoinInput): Promise<LoungeJoinResult> {
    if (this.session) await this.leave(this.session).catch(() => {});
    const key = JSON.stringify(input);
    if (this.joining?.key !== key) this.joining = { key, token: Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("") };
    const result = await this.send({ op: "join", input, token: this.joining.token });
    if (!result || !("session" in result)) throw new LoungeClientError("입장하지 못했어요. 다시 시도해 주세요.", 503);
    this.joining = null; this.session = result.session; this.activityAt = Date.now(); return result;
  }
  async resume(session: LoungeSession) {
    const alreadyBound = this.session?.token === session.token && this.socket?.readyState === WebSocket.OPEN;
    this.session = session;
    if (this.status === "expired") this.setStatus("connecting");
    const wasOpen = this.socket?.readyState === WebSocket.OPEN;
    await this.connect();
    if (wasOpen && !alreadyBound) await this.raw({ op: "resume", session });
    if (!this.state) throw new LoungeClientError("캠핑장을 다시 불러오고 있어요.", 503);
    return this.state;
  }
  async command(session: LoungeSession, command: LoungeCommand, signal?: AbortSignal) {
    if (command.type === "leave") return this.leave(session, command, signal);
    if (this.status !== "connected" || this.session?.token !== session.token) throw new LoungeClientError("연결이 돌아오면 다시 시도해 주세요.", 503);
    // Actions keep their commandId across one retry; old movement destinations are never replayed.
    const operation: LoungeSocketOperation = { op: "command", session, command };
    const result = command.type === "move" ? await this.raw(operation, signal) : await this.send(operation, signal);
    if (!result || !("players" in result)) throw new LoungeClientError("캠핑장 상태를 다시 불러오고 있어요.", 503);
    return result;
  }
  private async leave(session: LoungeSession, command: LoungeCommand = { type: "leave", commandId: crypto.randomUUID() }, signal?: AbortSignal) {
    this.session = null;
    if (this.retry) clearTimeout(this.retry); this.retry = null;
    try { await this.raw({ op: "command", session, command }, signal); }
    finally { this.connectAbort?.abort(); this.drop(); this.state = null; }
    return null;
  }
  disconnectIdle() {
    if (this.session || this.handlers.size) return;
    this.connectAbort?.abort(); this.drop(); this.state = null;
    if (this.render) cancelAnimationFrame(this.render); this.render = 0;
  }
  wake() {
    if (!this.session) return;
    if (Date.now() - this.receivedAt > 25000) this.drop();
    else if (!this.socket) this.retrySoon();
  }
  activity() {
    if (!this.session || this.status !== "connected" || Date.now() - this.activityAt < 10000) return;
    this.activityAt = Date.now();
    void this.raw({ op: "touch", session: this.session, activity: true }).catch(() => {});
  }
}

export const loungeSocket = new LoungeSocket();
