import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { LoungeRelay } from "./relay";
import { LoungeError, MemoryLounge } from "./memory";
import { verifyLoungeTicket } from "./ticket";
import { loungeChannels, loungeRules } from "../../lounge/shared";
import { diffLounge } from "../../lounge/protocol";
import type { LoungeSnapshot } from "../../types/Lounge";
import type { LoungeSocketFrame, LoungeSocketMember, LoungeSocketRequest } from "../../types/LoungeSocket";
import type { LoungeSocketServerOptions } from "../../types/LoungeServer";

export function attachLoungeSockets(server: Server, options: LoungeSocketServerOptions) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: { threshold: 1024, serverNoContextTakeover: true, clientNoContextTakeover: true } });
  const members = new Set<LoungeSocketMember>();
  const last = new Map<string, LoungeSnapshot>();
  let relay: LoungeRelay | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const send = (socket: WebSocket, frame: LoungeSocketFrame) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 262144) { socket.close(1013, "resync"); return; }
    socket.send(JSON.stringify(frame));
  };
  function broadcast(room: MemoryLounge) {
    broadcastSnapshot(room.snapshot());
  }
  function broadcastSnapshot(snapshot: LoungeSnapshot) {
    const previous = last.get(snapshot.channel.id);
    if (previous && previous.epoch === snapshot.epoch && previous.revision >= snapshot.revision) return;
    const patch = diffLounge(previous ?? null, snapshot); last.set(snapshot.channel.id, snapshot);
    for (const member of members) if (member.session?.channelId === snapshot.channel.id) {
      if (!previous || previous.epoch !== snapshot.epoch) send(member.socket, { type: "snapshot", snapshot });
      else if (previous.revision !== snapshot.revision) send(member.socket, { type: "patch", patch });
    }
  }
  function getRelay() {
    if (!relay) relay = new LoungeRelay(options.databaseUrl, options.scope, broadcast, () => {
      for (const member of members) member.socket.close(1012, "reconnect");
    }, options.secret);
    return relay;
  }
  function start() {
    if (!tick) tick = setInterval(() => {
      const active = new Set([...members].map((member) => member.session?.channelId).filter((id): id is string => Boolean(id)));
      getRelay().tick();
      for (const id of active) void getRelay().takeOver(id).catch(() => {});
    }, 500);
    if (!heartbeat) heartbeat = setInterval(() => {
      for (const member of members) {
        if (!member.alive) { member.socket.terminate(); continue; }
        member.alive = false; member.socket.ping();
        if (member.session) void getRelay().run({ op: "touch", session: member.session, activity: false }).catch((error) => {
          if (error instanceof LoungeError && error.status === 401) { send(member.socket, { type: "error", status: 401, message: "5분 동안 활동이 없어 캠핑장을 나왔어요." }); member.socket.close(4001, "expired"); }
        });
      }
    }, 15000);
  }

  wss.on("connection", (socket) => {
    const ageTimer = setTimeout(() => socket.close(1012, "refresh"), 240000 + Math.random() * 15000);
    const member: LoungeSocketMember = { socket, session: null, joining: false, alive: true, count: 0, windowAt: Date.now(), ageTimer };
    members.add(member); start();
    socket.on("error", () => {});
    socket.on("pong", () => { member.alive = true; });
    socket.on("message", async (bytes, binary) => {
      let id: string | undefined;
      try {
        if (binary) throw new LoungeError("텍스트 명령만 보낼 수 있어요.", 400);
        const request = JSON.parse(bytes.toString()) as LoungeSocketRequest;
        id = typeof request.id === "string" ? request.id : undefined;
        if (!id || !/^[\w-]{16,64}$/.test(id)) throw new LoungeError("올바르지 않은 요청입니다.", 400);
        if (Date.now() - member.windowAt > 1000) { member.count = 0; member.windowAt = Date.now(); }
        if (++member.count > 80) throw new LoungeError("잠깐 기다려 주세요.", 429);
        if (request.op === "ping") { send(socket, { type: "pong", sentAt: request.sentAt, serverNow: Date.now() }); return; }
        const hub = getRelay(); await hub.ready();
        if (request.op === "channels") {
          const channels = loungeChannels.map((channel) => ({ ...channel, count: hub.rooms.get(channel.id)?.state.players.length ?? 0 }));
          send(socket, { type: "result", id, result: { channels } }); return;
        }
        if (request.op === "join") {
          if (member.session || member.joining) throw new LoungeError("입장을 이미 진행하고 있어요.");
          member.joining = true;
          try {
            const result = await hub.run(request);
            if (!("session" in result)) throw new Error("Missing session");
            const latest = last.get(result.snapshot.channel.id);
            if (latest && latest.epoch === result.snapshot.epoch && latest.revision > result.snapshot.revision) result.snapshot = latest;
            broadcastSnapshot(result.snapshot); member.session = result.session;
            send(socket, { type: "result", id, result });
          } finally { member.joining = false; }
          return;
        }
        if (request.op === "resume") {
          if (!request.session || typeof request.session.token !== "string" || !/^[a-f0-9]{64}$/.test(request.session.token)) throw new LoungeError("다시 입장해 주세요.", 401);
          if (member.joining || (member.session && member.session.token !== request.session.token)) throw new LoungeError("먼저 현재 캠핑장을 나와 주세요.");
          let result = await hub.run(request);
          if ("players" in result) { const latest = last.get(result.channel.id); if (latest && latest.epoch === result.epoch && latest.revision > result.revision) result = latest; }
          if ("players" in result) broadcastSnapshot(result);
          member.session = request.session;
          send(socket, { type: "result", id, result }); return;
        }
        if (!member.session) throw new LoungeError("먼저 캠핑장에 입장해 주세요.", 401);
        if (request.op !== "command" && request.op !== "touch") throw new LoungeError("지원하지 않는 요청입니다.", 400);
        const operation = { ...request, session: member.session };
        const result = await hub.run(operation);
        if ("players" in result) broadcastSnapshot(result);
        else if ("applied" in result) {
          const snapshot = hub.rooms.get(result.channelId)?.snapshot();
          if (snapshot && snapshot.epoch === result.epoch && snapshot.revision >= result.revision) broadcastSnapshot(snapshot);
          else { socket.close(1012, "resync"); return; }
        }
        if (request.op === "command" && request.command.type === "leave") {
          const channelId = member.session.channelId; member.session = null;
          if (![...members].some((current) => current.session?.channelId === channelId)) await hub.release(channelId);
        }
        send(socket, { type: "ack", id, serverNow: Date.now() });
      } catch (error) {
        send(socket, { type: "error", id, status: error instanceof LoungeError ? error.status : 503, message: error instanceof LoungeError ? error.message : "실시간 연결을 다시 확인하고 있어요." });
      }
    });
    socket.on("close", async () => {
      clearTimeout(ageTimer); members.delete(member);
      const channelId = member.session?.channelId;
      const previous = relay;
      if (previous && channelId && ![...members].some((current) => current.session?.channelId === channelId)) await previous.release(channelId).catch(() => {});
      if (!members.size && relay === previous) {
        if (tick) clearInterval(tick); if (heartbeat) clearInterval(heartbeat); tick = null; heartbeat = null;
        relay = null; last.clear();
        if (previous) void previous.close();
      }
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== (options.path ?? "/api/lounge-socket") && url.pathname !== "/lounge-realtime") return;
    let originValid = false;
    try { originValid = new URL(request.headers.origin ?? "").host === request.headers.host; } catch { /* Missing origins are rejected. */ }
    if (!originValid || !verifyLoungeTicket(url.searchParams.get("ticket") ?? "", options.secret)) { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    request.socket.setNoDelay(true);
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });
  server.on("close", () => { if (tick) clearInterval(tick); if (heartbeat) clearInterval(heartbeat); for (const member of members) member.socket.terminate(); if (relay) void relay.close(); wss.close(); });
  return wss;
}
