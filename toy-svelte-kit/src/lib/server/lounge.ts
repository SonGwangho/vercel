import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getNeonSql } from "$lib/server/neon";
import { normalizeAppearance } from "$lib/lounge/appearance";
import { ambientFoodCount, dropHeldFood, groundFoodsAt } from "$lib/server/lounge/food";
import { actionDuration, actionNames, clampPosition, distance, foodName, interactionBlock, isLoungeEmote, loungeChannels, loungeFoods, loungeRules, loungeWorld, positionAt } from "$lib/lounge/shared";
import type { LoungeActionKind, LoungeChannelSummary, LoungeCommand, LoungeGroundFood, LoungeJoinInput, LoungeJoinResult, LoungePlayer, LoungePoint, LoungeRequest, LoungeRoomMutation, LoungeRoomRow, LoungeRoomState, LoungeSession, LoungeSnapshot, LoungeStoredPlayer, LoungeRoomCache } from "$lib/types/Lounge";

export class LoungeError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

let tableReady: Promise<void> | null = null;
const readCache = new Map<string, LoungeRoomCache>();
const readFlights = new Map<string, Promise<LoungeRoomRow>>();
const roomWaiters = new Map<string, Set<() => void>>();

function cacheRow(row: LoungeRoomRow) {
  const existing = readCache.get(row.channel_id);
  if (!existing || Number(existing.row.revision) <= Number(row.revision)) {
    readCache.set(row.channel_id, { row: structuredClone(row), expiresAt: Date.now() + 85 });
    if (!existing || Number(existing.row.revision) < Number(row.revision)) {
      for (const wake of roomWaiters.get(row.channel_id) ?? []) wake();
    }
  }
}

async function readRoomRow(channelId: string, shared: boolean, optimistic = false): Promise<LoungeRoomRow> {
  const cached = readCache.get(channelId);
  if (cached && ((shared && cached.expiresAt > Date.now()) || (optimistic && cached.expiresAt + 915 > Date.now()))) return structuredClone(cached.row);
  if (shared && readFlights.has(channelId)) return structuredClone(await readFlights.get(channelId)!);
  const pending = (async () => {
    const sql = getNeonSql();
    const rows = await sql`SELECT channel_id, revision, state FROM lounge_rooms WHERE channel_id = ${channelId}` as LoungeRoomRow[];
    if (!rows[0]) throw new LoungeError("채널을 불러오지 못했습니다.", 503);
    cacheRow(rows[0]);
    return rows[0];
  })();
  if (shared) readFlights.set(channelId, pending);
  try { return structuredClone(await pending); }
  finally { if (readFlights.get(channelId) === pending) readFlights.delete(channelId); }
}

function emptyRoom(): LoungeRoomState {
  return { players: [], foods: [], requests: [], messages: [], notices: [], lastFoodAt: Date.now(), appliedCommands: [] };
}

async function ensureRooms() {
  if (!tableReady) {
    tableReady = (async () => {
      const sql = getNeonSql();
      await sql`CREATE TABLE IF NOT EXISTS lounge_rooms (
        channel_id TEXT PRIMARY KEY,
        revision BIGINT NOT NULL DEFAULT 0,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      for (const channel of loungeChannels) {
        await sql`INSERT INTO lounge_rooms (channel_id, state)
          VALUES (${channel.id}, ${JSON.stringify(emptyRoom())}::jsonb)
          ON CONFLICT (channel_id) DO NOTHING`;
      }
    })().catch((error) => { tableReady = null; throw error; });
  }
  await tableReady;
}

function channelFor(id: string) {
  const channel = loungeChannels.find((item) => item.id === id);
  if (!channel) throw new LoungeError("존재하지 않는 채널입니다.", 404);
  return channel;
}

function notice(state: LoungeRoomState, text: string, now: number) {
  state.notices.push({ id: randomUUID(), text, createdAt: now });
  state.notices = state.notices.slice(-4);
}

function spawnFood(now: number, players: LoungeStoredPlayer[]): LoungeGroundFood {
  const definition = loungeFoods[Math.floor(Math.random() * loungeFoods.length)];
  const player = players[Math.floor(Math.random() * players.length)];
  const origin = positionAt(player, now);
  const angle = Math.random() * Math.PI * 2;
  const radius = 62 + Math.random() * 34;
  const point = clampPosition({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius });
  return {
    id: randomUUID(), kind: definition.kind, createdAt: now,
    ...point
  };
}

function releaseRequest(state: LoungeRoomState, request: LoungeRequest) {
  for (const player of state.players) {
    if (player.pendingRequestId === request.id) player.pendingRequestId = null;
  }
  state.requests = state.requests.filter((item) => item.id !== request.id);
}

function maintainRoom(state: LoungeRoomState, now: number) {
  let changed = false;
  const active = state.players.filter((player) => now - player.lastSeenAt < loungeRules.playerTimeoutMs);
  if (active.length !== state.players.length) { state.players = active; changed = true; }
  const ids = new Set(active.map((player) => player.id));
  for (const request of [...state.requests]) {
    if (request.expiresAt <= now || !ids.has(request.fromId) || !ids.has(request.toId)) {
      releaseRequest(state, request);
      changed = true;
    }
  }
  for (const player of state.players) {
    if (player.action && player.action.endsAt <= now) { player.action = null; changed = true; }
  }
  const messages = state.messages.filter((message) => now - message.createdAt < loungeRules.chatHistoryMs).slice(-loungeRules.chatHistoryLimit);
  if (messages.length !== state.messages.length) { state.messages = messages; changed = true; }
  const notices = state.notices.filter((item) => now - item.createdAt < 20000).slice(-4);
  if (notices.length !== state.notices.length) { state.notices = notices; changed = true; }
  const foods = groundFoodsAt(state.foods, now);
  if (foods.length !== state.foods.length) { state.foods = foods; changed = true; }
  if (state.players.length && now - state.lastFoodAt >= loungeRules.foodIntervalMs) {
    // One respawn per minute, near one live player. Never replay missed spawns in a burst.
    if (ambientFoodCount(state.foods) < loungeRules.maxGroundFoods) state.foods.push(spawnFood(now, state.players));
    state.lastFoodAt = now;
    changed = true;
  }
  return changed;
}

function snapshot(channelId: string, revision: number, state: LoungeRoomState, now: number): LoungeSnapshot {
  const players: LoungePlayer[] = state.players.map(({ tokenHash: _token, lastSeenAt: _seen, lastCommandAt: _command, lastChatAt: _chat, lastActivityAt: _activity, ...player }) => ({ ...player, appearance: normalizeAppearance(player.appearance, player.color) }));
  return {
    channel: channelFor(channelId), revision, serverNow: now,
    players, foods: state.foods, requests: state.requests,
    messages: state.messages, notices: state.notices
  };
}

async function updateRoom(channelId: string, mutate: LoungeRoomMutation, sharedRead = false, optimisticWrite = false) {
  channelFor(channelId);
  await ensureRooms();
  const sql = getNeonSql();
  // Revision-checked writes serialize actions across Vercel instances. A failed write is retried
  // against the latest room, so two people cannot acquire a food or reserve the same player twice.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const row = await readRoomRow(channelId, sharedRead && attempt === 0, optimisticWrite && attempt === 0);
    const state = row.state;
    const now = Date.now();
    const maintained = maintainRoom(state, now);
    let changed: boolean;
    try { changed = mutate(state, now); }
    catch (error) {
      // Recheck failed optimistic preconditions against fresh data before rejecting an action.
      if (attempt === 0 && error instanceof LoungeError && (optimisticWrite || (sharedRead && error.status === 401))) { readCache.delete(channelId); continue; }
      throw error;
    }
    if (!maintained && !changed) return snapshot(channelId, Number(row.revision), state, now);
    const written = await sql`UPDATE lounge_rooms
      SET state = ${JSON.stringify(state)}::jsonb, revision = revision + 1, updated_at = NOW()
      WHERE channel_id = ${channelId} AND revision = ${Number(row.revision)}
      RETURNING revision` as { revision: number | string }[];
    if (written.length) {
      cacheRow({ channel_id: channelId, revision: written[0].revision, state });
      return snapshot(channelId, Number(written[0].revision), state, Date.now());
    }
    await new Promise((resolve) => setTimeout(resolve, 2 + Math.random() * 4));
  }
  throw new LoungeError("다른 행동을 처리하고 있어요. 잠시 후 다시 시도해 주세요.", 409);
}

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

function authorize(state: LoungeRoomState, session: LoungeSession) {
  const player = state.players.find((item) => item.id === session.playerId);
  const hash = tokenHash(session.token);
  if (!player || player.tokenHash.length !== hash.length || !timingSafeEqual(Buffer.from(player.tokenHash, "hex"), Buffer.from(hash, "hex"))) {
    throw new LoungeError("입장 시간이 만료되었어요. 다시 입장해 주세요.", 401);
  }
  return player;
}

function requireAwake(player: LoungeStoredPlayer, now: number) {
  if (player.stunnedUntil > now) throw new LoungeError("기절 중에는 행동할 수 없어요.");
}

function requireAvailable(player: LoungeStoredPlayer, now: number) {
  const reason = interactionBlock(player, now);
  if (reason) throw new LoungeError(reason);
}

function requireNear(a: LoungeStoredPlayer, b: LoungePoint, now: number) {
  if (distance(positionAt(a, now), b) > loungeRules.interactionRange) {
    throw new LoungeError("조금 더 가까이 이동한 후 시도해 주세요.");
  }
}

function freeze(player: LoungeStoredPlayer, now: number) {
  const point = positionAt(player, now);
  player.move = { from: point, to: point, startedAt: now, endsAt: now };
}

function beginAction(player: LoungeStoredPlayer, kind: LoungeActionKind, duration: number, now: number, peerId?: string) {
  freeze(player, now);
  player.action = { id: randomUUID(), kind, startedAt: now, endsAt: now + duration, peerId };
}

export async function listLoungeChannels(): Promise<LoungeChannelSummary[]> {
  await ensureRooms();
  const sql = getNeonSql();
  const rows = await sql`SELECT channel_id, revision, state FROM lounge_rooms` as LoungeRoomRow[];
  const now = Date.now();
  return loungeChannels.map((channel) => ({
    ...channel,
    count: rows.find((row) => row.channel_id === channel.id)?.state.players.filter((player) => now - player.lastSeenAt < loungeRules.playerTimeoutMs).length ?? 0
  }));
}

export async function joinLounge(input: LoungeJoinInput): Promise<LoungeJoinResult> {
  if (!input || typeof input.channelId !== "string" || typeof input.nickname !== "string") throw new LoungeError("닉네임과 채널을 선택해 주세요.", 400);
  const channel = channelFor(input.channelId);
  const nickname = input.nickname.normalize("NFKC").trim();
  if (!nickname || [...nickname].length > loungeRules.nicknameMaxLength || /[\p{C}]/u.test(nickname)) throw new LoungeError("닉네임은 보이지 않는 문자를 제외한 1~6자로 입력해 주세요.", 400);
  const appearance = normalizeAppearance(input.appearance, input.color);
  const color = appearance.topColor;
  const token = randomBytes(32).toString("hex");
  const session = { channelId: channel.id, playerId: randomUUID(), token };
  const result = await updateRoom(channel.id, (state, now) => {
    if (state.players.length >= channel.capacity) throw new LoungeError("채널이 가득 찼어요. 다른 채널을 선택해 주세요.");
    if (state.players.some((player) => player.nickname.toLocaleLowerCase("ko-KR") === nickname.toLocaleLowerCase("ko-KR"))) {
      throw new LoungeError("이 채널에서 사용 중인 닉네임입니다. 다른 이름을 입력해 주세요.");
    }
    if (!state.players.length) {
      state.messages = []; state.requests = []; state.notices = []; state.appliedCommands = [];
      state.foods = [];
      state.lastFoodAt = now;
    }
    const point = { x: loungeWorld.width / 2 + (Math.random() - 0.5) * 300, y: loungeWorld.height / 2 + 240 + Math.random() * 160 };
    state.players.push({
      id: session.playerId, nickname, color, appearance, tokenHash: tokenHash(token),
      move: { from: point, to: point, startedAt: now, endsAt: now },
      inventory: [], heldFoodId: null, action: null, pendingRequestId: null, stunnedUntil: 0,
      joinedAt: now, lastSeenAt: now, lastActivityAt: now, lastCommandAt: 0, lastChatAt: 0
    });
    notice(state, `${nickname} 님이 들어왔어요.`, now);
    return true;
  });
  return { session, snapshot: result };
}

export async function readLounge(session: LoungeSession) {
  return updateRoom(session.channelId, (state, now) => {
    const player = authorize(state, session);
    if (now - player.lastSeenAt >= loungeRules.heartbeatMs) { player.lastSeenAt = now; return true; }
    return false;
  }, true);
}

function waitForRoomWake(channelId: string, revision: number, duration: number, signal: AbortSignal) {
  const advanced = () => Number(readCache.get(channelId)?.row.revision ?? -1) > revision;
  if (signal.aborted || advanced()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listeners = roomWaiters.get(channelId) ?? new Set<() => void>();
    roomWaiters.set(channelId, listeners);
    const finish = () => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", finish); listeners.delete(finish);
      if (!listeners.size) roomWaiters.delete(channelId);
      resolve();
    };
    listeners.add(finish); signal.addEventListener("abort", finish, { once: true });
    timer = setTimeout(finish, duration);
    if (signal.aborted || advanced()) finish();
  });
}

export async function waitForLoungeChange(session: LoungeSession, initial: LoungeSnapshot, signal: AbortSignal) {
  const deadline = Date.now() + loungeRules.syncWaitMs;
  let result = initial;
  while (!signal.aborted && result.revision === initial.revision && Date.now() < deadline) {
    const interval = result.players.length > 1 ? loungeRules.pollMs : loungeRules.soloPollMs;
    await waitForRoomWake(session.channelId, initial.revision, Math.min(interval, deadline - Date.now()), signal);
    if (signal.aborted) break;
    result = await readLounge(session);
  }
  return result;
}

async function moveLounge(session: LoungeSession, command: Extract<LoungeCommand, { type: "move" }>) {
  if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) throw new LoungeError("이동할 위치가 올바르지 않습니다.", 400);
  channelFor(session.channelId);
  await ensureRooms();
  const to = clampPosition(command);
  const now = Date.now();
  const hash = tokenHash(session.token);
  const sql = getNeonSql();
  // Evaluate the current path and action guards inside the UPDATE. Concurrent moves update
  // only their own player without a preceding read or a channel-wide revision retry.
  const rows = await sql`UPDATE lounge_rooms AS room
    SET state = jsonb_set(room.state, '{players}', (
      SELECT jsonb_agg(CASE WHEN player->>'id' = ${session.playerId} THEN
        player || jsonb_build_object(
          'move', jsonb_build_object(
            'from', jsonb_build_object('x', point.x, 'y', point.y),
            'to', jsonb_build_object('x', ${to.x}::double precision, 'y', ${to.y}::double precision),
            'startedAt', ${now}::bigint,
            'endsAt', ${now}::double precision + sqrt(power(${to.x}::double precision - point.x, 2) + power(${to.y}::double precision - point.y, 2)) / ${loungeWorld.speed}::double precision * 1000
          ), 'lastSeenAt', ${now}::bigint
        ) ELSE player END ORDER BY ordinal)
      FROM jsonb_array_elements(room.state->'players') WITH ORDINALITY AS people(player, ordinal)
      CROSS JOIN LATERAL (SELECT CASE
        WHEN (player->'move'->>'endsAt')::double precision <= (player->'move'->>'startedAt')::double precision THEN 1
        ELSE LEAST(1, GREATEST(0, (${now}::double precision - (player->'move'->>'startedAt')::double precision) /
          GREATEST(1, (player->'move'->>'endsAt')::double precision - (player->'move'->>'startedAt')::double precision))) END AS fraction) AS progress
      CROSS JOIN LATERAL (SELECT
        (player->'move'->'from'->>'x')::double precision + ((player->'move'->'to'->>'x')::double precision - (player->'move'->'from'->>'x')::double precision) * progress.fraction AS x,
        (player->'move'->'from'->>'y')::double precision + ((player->'move'->'to'->>'y')::double precision - (player->'move'->'from'->>'y')::double precision) * progress.fraction AS y) AS point
    ), false), revision = room.revision + 1, updated_at = NOW()
    WHERE room.channel_id = ${session.channelId} AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(room.state->'players') AS candidates(player)
      WHERE player->>'id' = ${session.playerId} AND player->>'tokenHash' = ${hash}
        AND (player->>'lastSeenAt')::bigint > ${now - loungeRules.playerTimeoutMs}::bigint
        AND COALESCE((player->>'stunnedUntil')::bigint, 0) <= ${now}::bigint
        AND COALESCE((player->'action'->>'endsAt')::bigint, 0) <= ${now}::bigint
    ) RETURNING channel_id, revision, state` as LoungeRoomRow[];
  if (!rows[0]) {
    const current = await readLounge(session);
    const player = current.players.find((item) => item.id === session.playerId);
    if (!player) throw new LoungeError("다시 입장해 주세요.", 401);
    if (player.stunnedUntil > Date.now()) throw new LoungeError("기절 중에는 행동할 수 없어요.");
    if (player.action && player.action.endsAt > Date.now()) throw new LoungeError("행동이 끝나면 이동할 수 있어요.");
    throw new LoungeError("이동 상태가 바뀌었어요. 다시 클릭해 주세요.");
  }
  cacheRow(rows[0]);
  return snapshot(session.channelId, Number(rows[0].revision), rows[0].state, Date.now());
}

function respond(state: LoungeRoomState, player: LoungeStoredPlayer, command: Extract<LoungeCommand, { type: "respond" }>, now: number) {
  const request = state.requests.find((item) => item.id === command.requestId && item.toId === player.id);
  if (!request) throw new LoungeError("이미 끝났거나 만료된 요청입니다.");
  const sender = state.players.find((item) => item.id === request.fromId);
  if (!sender) throw new LoungeError("상대가 라운지에서 나갔어요.");
  if (!command.accept) { releaseRequest(state, request); return; }
  requireAwake(sender, now);
  requireAwake(player, now);
  if (sender.action || player.action || sender.pendingRequestId !== request.id || player.pendingRequestId !== request.id) throw new LoungeError("이미 다른 행동을 진행하고 있어요.");
  requireNear(sender, positionAt(player, now), now);
  const duration = request.kind === "hug" ? 1800 : 1200;
  if (request.kind === "give") {
    const food = sender.inventory.find((item) => item.id === request.foodId);
    if (!food) throw new LoungeError("건넬 음식이 더 이상 없어요.");
    if (player.inventory.length >= loungeRules.inventoryCapacity) throw new LoungeError("음식을 받을 공간이 없어요.");
    sender.inventory = sender.inventory.filter((item) => item.id !== food.id);
    if (sender.heldFoodId === food.id) sender.heldFoodId = null;
    player.inventory.push(food);
    notice(state, `${sender.nickname} 님 → ${player.nickname} 님 · ${foodName(food.kind)} 선물`, now);
  } else {
    notice(state, `${sender.nickname} 님과 ${player.nickname} 님이 ${actionNames[request.kind]}했어요.`, now);
  }
  releaseRequest(state, request);
  beginAction(sender, request.kind, duration, now, player.id);
  beginAction(player, request.kind, duration, now, sender.id);
  if (request.foodKind) { sender.action!.foodKind = request.foodKind; player.action!.foodKind = request.foodKind; }
}

export async function commandLounge(session: LoungeSession, command: LoungeCommand) {
  if (!command || typeof command.type !== "string" || typeof command.commandId !== "string" || !/^[\w-]{16,64}$/.test(command.commandId)) throw new LoungeError("올바르지 않은 행동 요청입니다.", 400);
  if (command.type === "move") return moveLounge(session, command);
  return updateRoom(session.channelId, (state, now) => {
    const player = authorize(state, session);
    if (state.appliedCommands.some((item) => item.id === command.commandId && item.playerId === player.id)) return false;
    if (command.type === "leave") {
      state.players = state.players.filter((item) => item.id !== player.id);
      for (const request of [...state.requests]) if (request.fromId === player.id || request.toId === player.id) releaseRequest(state, request);
      notice(state, `${player.nickname} 님이 나갔어요.`, now);
      return true;
    }
    requireAwake(player, now);
    if (command.type === "chat") {
      if (typeof command.text !== "string") throw new LoungeError("보낼 내용을 입력해 주세요.", 400);
      const text = command.text.normalize("NFKC").trim().replace(/[\p{C}]/gu, " ");
      if (!text || [...text].length > loungeRules.chatMaxLength) throw new LoungeError(`대화는 1~${loungeRules.chatMaxLength}자로 입력해 주세요.`, 400);
      if (now - player.lastChatAt < 800) throw new LoungeError("잠깐 기다린 뒤 말씀해 주세요.", 429);
      state.messages.push({ id: randomUUID(), playerId: player.id, nickname: player.nickname, text, createdAt: now });
      state.messages = state.messages.slice(-loungeRules.chatHistoryLimit);
      player.lastChatAt = now;
    } else if (command.type === "emote") {
      requireAvailable(player, now);
      if (!isLoungeEmote(command.kind)) throw new LoungeError("지원하지 않는 표현이에요.", 400);
      player.heldFoodId = null;
      beginAction(player, command.kind, actionDuration(command.kind), now);
    } else if (command.type === "stopEmote") {
      if (player.action && !isLoungeEmote(player.action.kind)) throw new LoungeError("이 행동은 도중에 멈출 수 없어요.");
      player.action = null;
    } else if (command.type === "interact") {
      requireAvailable(player, now);
      const target = state.players.find((item) => item.id === command.targetId && item.id !== player.id);
      if (!target) throw new LoungeError("상대를 찾을 수 없어요.");
      if (!["handshake", "hug", "give", "punch"].includes(command.kind)) throw new LoungeError("지원하지 않는 행동입니다.", 400);
      requireAvailable(target, now);
      requireNear(player, positionAt(target, now), now);
      if (command.kind === "punch") {
        const dropped = dropHeldFood(state, target, player, now);
        beginAction(player, "punch", 650, now, target.id);
        beginAction(target, "hit", loungeRules.stunMs, now, player.id);
        target.stunnedUntil = now + loungeRules.stunMs;
        notice(state, dropped ? `${player.nickname} 님의 펀치! ${target.nickname} 님이 ${foodName(dropped.kind)} 떨어뜨렸어요.` : `${player.nickname} 님의 펀치! ${target.nickname} 님이 잠깐 기절했어요.`, now);
      } else {
        const food = command.kind === "give" ? player.inventory.find((item) => item.id === command.foodId) : undefined;
        if (command.kind === "give" && !food) throw new LoungeError("먼저 건넬 음식을 골라 주세요.");
        if (command.kind === "give" && target.inventory.length >= loungeRules.inventoryCapacity) throw new LoungeError("상대가 음식을 더 받을 수 없어요.");
        const request: LoungeRequest = { id: randomUUID(), kind: command.kind, fromId: player.id, toId: target.id, createdAt: now, expiresAt: now + loungeRules.requestMs, foodId: food?.id, foodKind: food?.kind };
        state.requests.push(request);
        player.pendingRequestId = request.id;
        target.pendingRequestId = request.id;
      }
    } else if (command.type === "respond") {
      if (typeof command.accept !== "boolean") throw new LoungeError("수락 여부가 올바르지 않습니다.", 400);
      respond(state, player, command, now);
    } else if (command.type === "cancel") {
      const request = state.requests.find((item) => item.id === command.requestId && item.fromId === player.id);
      if (!request) throw new LoungeError("이미 끝난 요청입니다.");
      releaseRequest(state, request);
    } else if (command.type === "pickup") {
      requireAvailable(player, now);
      const food = state.foods.find((item) => item.id === command.foodId);
      if (!food) throw new LoungeError("다른 사람이 먼저 주웠어요.");
      if (player.inventory.length >= loungeRules.inventoryCapacity) throw new LoungeError(`음식은 ${loungeRules.inventoryCapacity}개까지 들 수 있어요.`);
      requireNear(player, food, now);
      state.foods = state.foods.filter((item) => item.id !== food.id);
      player.inventory.push({ id: food.id, kind: food.kind });
      beginAction(player, "pickup", 450, now);
      player.action!.foodKind = food.kind;
    } else if (command.type === "equip") {
      requireAvailable(player, now);
      if (!player.inventory.some((food) => food.id === command.foodId)) throw new LoungeError("가방에 없는 음식이에요.");
      player.heldFoodId = command.foodId;
    } else if (command.type === "stow") {
      requireAvailable(player, now);
      player.heldFoodId = null;
    } else if (command.type === "eat") {
      requireAvailable(player, now);
      if (player.heldFoodId !== command.foodId) throw new LoungeError("먼저 가방에서 음식을 손에 들어 주세요.");
      const food = player.inventory.find((item) => item.id === command.foodId);
      if (!food) throw new LoungeError("이 음식은 더 이상 가지고 있지 않아요.");
      player.inventory = player.inventory.filter((item) => item.id !== food.id);
      player.heldFoodId = null;
      beginAction(player, "eat", 1600, now);
      player.action!.foodKind = food.kind;
      notice(state, `${player.nickname} 님이 ${foodName(food.kind)} 먹는 중이에요.`, now);
    } else { throw new LoungeError("지원하지 않는 행동입니다.", 400); }
    player.lastCommandAt = now;
    player.lastSeenAt = now;
    player.lastActivityAt = now;
    state.appliedCommands.push({ id: command.commandId, playerId: player.id });
    state.appliedCommands = state.appliedCommands.slice(-128);
    return true;
  }, false, true);
}

export function sessionFromRequest(request: Request, channelId: string): LoungeSession {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  const playerId = request.headers.get("x-lounge-player") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9-]{36}$/.test(playerId)) throw new LoungeError("먼저 닉네임을 입력하고 입장해 주세요.", 401);
  return { channelId, playerId, token };
}
