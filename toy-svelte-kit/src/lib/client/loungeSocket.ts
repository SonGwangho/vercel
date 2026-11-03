import { LoungeClientError } from "./loungeError";
import { mergeLounge } from "$lib/lounge/protocol";
import type { LoungeCommand, LoungeJoinInput, LoungeJoinResult, LoungeSession, LoungeSnapshot } from "$lib/types/Lounge";
import type { LoungeClientPending, LoungeSocketFrame, LoungeSocketHandlers, LoungeSocketOperation, LoungeSocketResult } from "$lib/types/LoungeSocket";

class LoungeSocket {
  private socket: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private session: LoungeSession | null = null;
  private state: LoungeSnapshot | null = null;
  private handlers = new Set<LoungeSocketHandlers>();
  private pending = new Map<string, LoungeClientPending>();
  private status: "connecting" | "connected" | "reconnecting" | "expired" = "connecting";
  private retry: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private render = 0;
  private activityAt = 0;

  subscribe(handlers: LoungeSocketHandlers) {
    this.handlers.add(handlers); handlers.onStatus(this.status);
    if (this.state) handlers.onState(this.state);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ op: "ping", id: crypto.randomUUID(), sentAt: Date.now() }));
    return () => { this.handlers.delete(handlers); };
  }
  private setStatus(status: typeof this.status) { this.status = status; for (const handler of this.handlers) handler.onStatus(status); }
  private accept(snapshot: LoungeSnapshot) {
    if (this.state?.channel.id === snapshot.channel.id && this.state.epoch === snapshot.epoch && this.state.revision > snapshot.revision) return;
    this.state = snapshot;
    if (this.session?.channelId === snapshot.channel.id && !snapshot.players.some((player) => player.id === this.session?.playerId)) { this.expire("5분 동안 활동이 없어 캠핑장을 나왔어요. 다시 입장해 주세요."); return; }
    if (!this.render) this.render = requestAnimationFrame(() => { this.render = 0; if (this.state) for (const handler of this.handlers) handler.onState(this.state); });
  }
  private receive(frame: LoungeSocketFrame) {
    if (frame.type === "pong") { for (const handler of this.handlers) handler.onClock(frame.serverNow, frame.sentAt); return; }
    if (frame.type === "snapshot") { this.accept(frame.snapshot); return; }
    if (frame.type === "patch") { if (this.state) this.accept(mergeLounge(this.state, frame.patch)); return; }
    if (frame.type === "result") {
      if ("snapshot" in frame.result) this.accept(frame.result.snapshot);
      else if ("players" in frame.result) this.accept(frame.result);
    }
    const pending = frame.id ? this.pending.get(frame.id) : undefined;
    if (pending && frame.id) { clearTimeout(pending.timer); this.pending.delete(frame.id); }
    if (frame.type === "error") {
      pending?.reject(new LoungeClientError(frame.message, frame.status));
      if (frame.status === 401 && this.session) this.expire(frame.message);
    } else pending?.resolve(frame.type === "result" ? frame.result : this.state);
  }
  private expire(message: string) {
    this.session = null; this.setStatus("expired");
    if (this.retry) clearTimeout(this.retry); this.retry = null;
    for (const handler of this.handlers) handler.onExpired(message);
    this.socket?.close(4000, "expired");
  }
  private retrySoon() {
    if (!this.session || this.retry) return;
    this.setStatus("reconnecting");
    this.retry = setTimeout(() => { this.retry = null; void this.connect().catch(() => this.retrySoon()); }, Math.min(3000, 200 * 2 ** Math.min(this.attempts++, 4)) + Math.random() * 150);
  }
  private raw(operation: LoungeSocketOperation | { op: "channels" }): Promise<LoungeSocketResult | null> {
    if (this.socket?.readyState !== WebSocket.OPEN) return Promise.reject(new LoungeClientError("연결을 다시 확인하고 있어요.", 503));
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new LoungeClientError("응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.", 504)); }, 12000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket!.send(JSON.stringify({ ...operation, id })); }
      catch { clearTimeout(timer); this.pending.delete(id); reject(new LoungeClientError("연결이 끊겼어요. 다시 연결하고 있어요.", 503)); }
    });
  }
  async connect() {
    if (this.opening) return this.opening;
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.opening = (async () => {
      const response = await fetch("/api/lounge/ticket", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ticket) throw new LoungeClientError(body?.message ?? "캠핑장에 연결하지 못했어요.", response.status || 503);
      const url = new URL("/api/lounge-socket", location.href); url.protocol = location.protocol === "https:" ? "wss:" : "ws:"; url.searchParams.set("ticket", body.ticket);
      const socket = new WebSocket(url); this.socket = socket;
      socket.onmessage = (event) => { try { this.receive(JSON.parse(event.data)); } catch { socket.close(1002, "invalid frame"); } };
      socket.onclose = (event) => {
        if (this.socket !== socket) return;
        this.socket = null;
        if (this.pingTimer) clearInterval(this.pingTimer); this.pingTimer = null;
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new LoungeClientError("연결이 끊겼어요. 다시 연결하고 있어요.", 503)); }
        this.pending.clear();
        if (event.code === 4001 && this.session) this.expire("5분 동안 활동이 없어 캠핑장을 나왔어요.");
        else this.retrySoon();
      };
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { socket.close(); reject(new LoungeClientError("캠핑장 연결 시간이 초과됐어요.", 503)); }, 10000);
        socket.onopen = () => { clearTimeout(timeout); resolve(); };
        socket.onerror = () => { clearTimeout(timeout); reject(new LoungeClientError("실시간 연결을 열지 못했어요. 잠시 후 다시 시도해 주세요.", 503)); };
      });
      if (this.session) await this.raw({ op: "resume", session: this.session });
      if (socket.readyState !== WebSocket.OPEN) throw new LoungeClientError("실시간 연결을 다시 열고 있어요.", 503);
      this.attempts = 0; this.setStatus("connected");
      const ping = () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: "ping", id: crypto.randomUUID(), sentAt: Date.now() })); };
      ping(); if (this.pingTimer) clearInterval(this.pingTimer); this.pingTimer = setInterval(ping, 10000);
    })();
    try { await this.opening; }
    catch (error) { this.socket?.close(); this.retrySoon(); throw error; }
    finally { this.opening = null; }
  }
  async channels() {
    await this.connect(); const result = await this.raw({ op: "channels" });
    if (!result || !("channels" in result)) throw new LoungeClientError("캠핑장 목록을 불러오지 못했어요.", 503);
    return result.channels;
  }
  async join(input: LoungeJoinInput): Promise<LoungeJoinResult> {
    if (this.session) await this.leave(this.session);
    await this.connect(); const result = await this.raw({ op: "join", input });
    if (!result || !("session" in result)) throw new LoungeClientError("입장하지 못했어요. 다시 시도해 주세요.", 503);
    this.session = result.session; this.activityAt = Date.now(); return result;
  }
  async resume(session: LoungeSession) {
    const alreadyBound = this.session?.token === session.token && this.socket?.readyState === WebSocket.OPEN;
    this.session = session;
    const wasOpen = this.socket?.readyState === WebSocket.OPEN;
    await this.connect();
    if (wasOpen && !alreadyBound) await this.raw({ op: "resume", session });
    if (!this.state) throw new LoungeClientError("캠핑장을 다시 불러오고 있어요.", 503);
    return this.state;
  }
  async command(session: LoungeSession, command: LoungeCommand) {
    if (command.type === "leave") return this.leave(session, command);
    if (this.status !== "connected" || this.session?.token !== session.token) throw new LoungeClientError("연결이 돌아오면 다시 시도해 주세요.", 503);
    const result = await this.raw({ op: "command", session, command });
    if (!result || !("players" in result)) throw new LoungeClientError("캠핑장 상태를 다시 불러오고 있어요.", 503);
    return result;
  }
  private async leave(session: LoungeSession, command: LoungeCommand = { type: "leave", commandId: crypto.randomUUID() }) {
    this.session = null;
    if (this.retry) clearTimeout(this.retry); this.retry = null;
    try { await this.raw({ op: "command", session, command }); }
    finally { this.socket?.close(1000, "left"); this.state = null; }
    return null;
  }
  activity() {
    if (!this.session || this.status !== "connected" || Date.now() - this.activityAt < 10000) return;
    this.activityAt = Date.now();
    void this.raw({ op: "touch", session: this.session, activity: true }).catch(() => {});
  }
}

export const loungeSocket = new LoungeSocket();
