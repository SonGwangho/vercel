import { arrangeSocialPlayers } from "./interaction";
import { applyFishing, isFishingCommand } from "./fishing";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { normalizeAppearance } from "../../lounge/appearance";
import { planMove, walkablePoint } from "../../lounge/navigation";
import { ambientFoodCount, dropHeldFood, groundFoodsAt } from "./food";
import { actionDuration, actionNames, clampPosition, distance, foodName, interactionBlock, interactionRangeFor, isLoungeEmote, loungeChannels, loungeFoods, loungeRules, loungeWorld, positionAt } from "../../lounge/shared";
import type { LoungeActionKind, LoungeCommand, LoungeGroundFood, LoungeJoinInput, LoungeJoinResult, LoungePlayer, LoungePoint, LoungeRequest, LoungeRoomMutation, LoungeRoomState, LoungeSession, LoungeSnapshot, LoungeStoredPlayer } from "../../types/Lounge";
import type { LoungeReplica } from "../../types/LoungeSocket";

export class LoungeError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
function channelFor(id: string) {
  const channel = loungeChannels.find((item) => item.id === id);
  if (!channel) throw new LoungeError("없는 캠핑장이에요.", 404);
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
  const point = walkablePoint({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius });
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
  const active = state.players.filter((player) => now - player.lastSeenAt < loungeRules.disconnectGraceMs && now - (player.lastActivityAt ?? player.joinedAt) < loungeRules.playerTimeoutMs);
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
  const players: LoungePlayer[] = state.players.map(({ tokenHash: _token, lastSeenAt: _seen, lastCommandAt: _command, lastChatAt: _chat, lastActivityAt: _activity, lastMoveCommandId: _moveId, ...player }) => ({ ...player, appearance: normalizeAppearance(player.appearance, player.color) }));
  return {
    channel: channelFor(channelId), revision, serverNow: now,
    players, foods: state.foods, requests: state.requests,
    messages: state.messages, notices: state.notices
  };
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

function requireNear(a: LoungeStoredPlayer, b: LoungePoint, now: number, range = loungeRules.interactionRange) {
  if (distance(positionAt(a, now), b) > range) {
    throw new LoungeError("조금 더 가까이 이동한 후 시도해 주세요.");
  }
}

function freeze(player: LoungeStoredPlayer, now: number) {
  const point = positionAt(player, now);
  player.move = { from: point, to: point, startedAt: now, endsAt: now };
}

function beginAction(player: LoungeStoredPlayer, kind: LoungeActionKind, duration: number, now: number, peerId?: string) {
  freeze(player, now);
  player.fishHeld = false;
  player.action = { id: randomUUID(), kind, startedAt: now, endsAt: now + duration, peerId };
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
  requireNear(sender, positionAt(player, now), now, interactionRangeFor(request.kind));
  if (!arrangeSocialPlayers(sender, player, request.kind, now)) throw new LoungeError("주변에 공간이 부족해요. 조금 이동해 주세요.");
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
  if (request.foodKind) {
    sender.action!.foodKind = request.foodKind;
    sender.action!.giveRole = "giver";
    player.action!.foodKind = request.foodKind;
    player.action!.giveRole = "receiver";
  }
}

export class MemoryLounge {
  private maintenanceAt = 0;
  state: LoungeRoomState;
  revision = 0;
  epoch: string = randomUUID();
  constructor(public channelId: string, replica?: LoungeReplica) {
    channelFor(channelId);
    this.state = { players: [], foods: [], requests: [], messages: [], notices: [], lastFoodAt: Date.now(), appliedCommands: [] };
    if (replica) this.restore(replica);
  }
  restore(replica: LoungeReplica) { this.state = structuredClone(replica.state); this.revision = replica.revision; this.epoch = replica.epoch; this.maintenanceAt = 0; }
  replica(): LoungeReplica { return { channelId: this.channelId, revision: this.revision, epoch: this.epoch, state: structuredClone(this.state) }; }
  snapshot(): LoungeSnapshot { return { ...snapshot(this.channelId, this.revision, this.state, Date.now()), epoch: this.epoch }; }
  read(session: LoungeSession) { return this.touch(session, false); }
  private mutate(mutation: LoungeRoomMutation) {
    const next = structuredClone(this.state); const now = Date.now();
    const maintained = maintainRoom(next, now); const changed = mutation(next, now);
    if (maintained || changed) { this.state = next; this.revision += 1; this.maintenanceAt = 0; }
    return this.snapshot();
  }
  tick() {
    if (Date.now() < this.maintenanceAt) return;
    this.mutate(() => false);
    // Rendering and interpolation run in the browser. Only timed game transitions need
    // server maintenance; avoid cloning the room and chat history twice a second at rest.
    this.maintenanceAt = Math.min(
      Infinity,
      ...(this.state.players.length ? [this.state.lastFoodAt + loungeRules.foodIntervalMs] : []),
      ...this.state.players.flatMap((player) => [player.lastSeenAt + loungeRules.disconnectGraceMs, (player.lastActivityAt ?? player.joinedAt) + loungeRules.playerTimeoutMs, player.action?.endsAt ?? Infinity]),
      ...this.state.requests.map((request) => request.expiresAt),
      ...this.state.messages.map((message) => message.createdAt + loungeRules.chatHistoryMs),
      ...this.state.notices.map((item) => item.createdAt + 20000),
      ...this.state.foods.map((food) => food.createdAt + loungeRules.foodLifetimeMs)
    );
  }
  touch(session: LoungeSession, activity: boolean) {
    return this.mutate((state, now) => {
      const player = authorize(state, session);
      if (now - player.lastSeenAt < 10000 && (!activity || now - (player.lastActivityAt ?? 0) < 10000)) return false;
      player.lastSeenAt = now; if (activity) player.lastActivityAt = now; return true;
    });
  }
  join(input: LoungeJoinInput, joinToken?: string): LoungeJoinResult {
  if (!input || typeof input.channelId !== "string" || typeof input.nickname !== "string") throw new LoungeError("닉네임과 채널을 선택해 주세요.", 400);
  if (joinToken !== undefined && !/^[a-f0-9]{64}$/.test(joinToken)) throw new LoungeError("올바르지 않은 입장 요청입니다.", 400);
  const channel = channelFor(input.channelId);
  // A lost join response can be retried, including after reconnecting to another instance.
  const existing = joinToken && this.state.players.find((player) => player.tokenHash === tokenHash(joinToken));
  if (existing) {
    const session = { channelId: channel.id, playerId: existing.id, token: joinToken! };
    return { session, snapshot: this.read(session) };
  }
  const nickname = input.nickname.normalize("NFKC").trim();
  if (!nickname || [...nickname].length > loungeRules.nicknameMaxLength || /[\p{C}]/u.test(nickname)) throw new LoungeError("닉네임은 보이지 않는 문자를 제외한 1~6자로 입력해 주세요.", 400);
  const appearance = normalizeAppearance(input.appearance, input.color);
  const color = appearance.topColor;
  const token = joinToken ?? randomBytes(32).toString("hex");
  const session = { channelId: channel.id, playerId: randomUUID(), token };
    const result = this.mutate((state, now) => {
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
  command(session: LoungeSession, command: LoungeCommand) {
    if (!command || typeof command.commandId !== "string" || !/^[\w-]{16,64}$/.test(command.commandId)) throw new LoungeError("올바르지 않은 행동입니다.", 400);
    return this.mutate((state, now) => {
    const player = authorize(state, session);
    if (command.type === "move" && player.lastMoveCommandId === command.commandId) return false;
    if (state.appliedCommands.some((item) => item.id === command.commandId && item.playerId === player.id)) return false;
    if (command.type === "leave") {
      state.players = state.players.filter((item) => item.id !== player.id);
      for (const request of [...state.requests]) if (request.fromId === player.id || request.toId === player.id) releaseRequest(state, request);
      notice(state, `${player.nickname} 님이 나갔어요.`, now);
      return true;
    }
    requireAwake(player, now);
    if (isFishingCommand(command)) {
      const error = applyFishing(player, command, now);
      if (error) throw new LoungeError(error);
    } else if (command.type === "move") {
      if (player.pendingCatch) throw new LoungeError("잡은 물고기를 가방에 넣거나 버려 주세요.");
      if (player.action && player.action.endsAt > now) throw new LoungeError("행동이 끝나면 이동할 수 있어요.");
      if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) throw new LoungeError("이동할 위치가 올바르지 않습니다.", 400);
      player.move = planMove(positionAt(player, now), command, now);
    } else if (command.type === "chat") {
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
      player.fishHeld = false;
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
      requireNear(player, positionAt(target, now), now, interactionRangeFor(command.kind));
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
      player.fishHeld = false;
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
    if (command.type === "move") player.lastMoveCommandId = command.commandId;
    else state.appliedCommands.push({ id: command.commandId, playerId: player.id });
    state.appliedCommands = state.appliedCommands.slice(-128);
    return true;
    });
  }
}
