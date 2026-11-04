import { randomInt, randomUUID } from "node:crypto";
import { insectPositionAt, insectRules, insectSpecies } from "../../lounge/insects";
import { clear, walkablePoint } from "../../lounge/navigation";
import { distance, interactionBlock, loungeWorld, positionAt } from "../../lounge/shared";
import { signCatch } from "./catch-receipt";
import type { LoungeCommandInput, LoungePoint, LoungeRoomState, LoungeStoredPlayer } from "../../types/Lounge";
import type { LoungeFieldInsect } from "../../types/LoungeInsect";

function move(insect: LoungeFieldInsect, to: LoungePoint, now: number, duration: number) {
  const from = insectPositionAt(insect, now);
  insect.move = { from, to, startedAt: now, endsAt: now + duration };
}

function wander(insect: LoungeFieldInsect, now: number) {
  const from = insectPositionAt(insect, now);
  const flying = insect.kind === "bee" || insect.kind === "butterfly";
  const duration = insect.kind === "butterfly" ? randomInt(350, 751) : flying ? randomInt(1000, 1901) : randomInt(900, 1801);
  const speed = insect.kind === "butterfly" ? loungeWorld.speed : flying ? 95 : 34;
  let target = from;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = Math.random() * Math.PI * 2;
    const point = walkablePoint({ x: from.x + Math.cos(angle) * speed * duration / 1000, y: from.y + Math.sin(angle) * speed * duration / 1000 });
    if (clear(from, point) && distance(from, point) > 8) { target = point; break; }
  }
  move(insect, target, now, duration);
  insect.nextMoveAt = now + duration + (flying ? 0 : randomInt(600, 1801));
}

function spawn(now: number): LoungeFieldInsect {
  let roll = randomInt(insectSpecies.reduce((sum, species) => sum + species.weight, 0));
  const species = insectSpecies.find((species) => (roll -= species.weight) < 0)!;
  let point: LoungePoint = { x: loungeWorld.width / 2, y: loungeWorld.height / 2 + 240 };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = walkablePoint({ x: loungeWorld.padding + Math.random() * (loungeWorld.width - loungeWorld.padding * 2), y: loungeWorld.padding + Math.random() * (loungeWorld.height - loungeWorld.padding * 2) });
    if (clear(candidate, candidate)) { point = candidate; break; }
  }
  return { id: randomUUID(), kind: species.kind, sizeCm: randomInt(species.minCm, species.maxCm + 1), spawnedAt: now, expiresAt: now + insectRules.lifetimeMs,
    move: { from: point, to: point, startedAt: now, endsAt: now }, nextMoveAt: now, nextJumpAt: now, seed: Math.random() * 100 };
}

export function maintainInsects(state: LoungeRoomState, now: number) {
  let changed = false;
  state.insects ??= [];
  state.lastInsectAt ??= now - insectRules.spawnIntervalMs;
  const live = state.insects.filter((insect) => insect.expiresAt > now);
  if (live.length !== state.insects.length) { state.insects = live; changed = true; }
  if (!state.players.length) {
    if (state.insects.length) { state.insects = []; changed = true; }
    return changed;
  }
  if (now - state.lastInsectAt >= insectRules.spawnIntervalMs) {
    if (state.insects.length < insectRules.maxFieldInsects) state.insects.push(spawn(now));
    state.lastInsectAt = now; changed = true;
  }
  for (const insect of state.insects) {
    if (["mantis", "bee", "butterfly"].includes(insect.kind) && now >= insect.nextMoveAt) { wander(insect, now); changed = true; }
    if (insect.kind !== "grasshopper" || now < insect.nextJumpAt) continue;
    const from = insectPositionAt(insect, now);
    const nearest = state.players.map((player) => positionAt(player, now)).sort((a, b) => distance(from, a) - distance(from, b))[0];
    if (!nearest || distance(from, nearest) > insectRules.jumpRange) continue;
    const angle = Math.atan2(from.y - nearest.y, from.x - nearest.x);
    let target = from;
    for (const offset of [0, .45, -.45, .9, -.9, Math.PI / 2, -Math.PI / 2]) {
      const candidate = walkablePoint({ x: from.x + Math.cos(angle + offset) * insectRules.jumpDistance, y: from.y + Math.sin(angle + offset) * insectRules.jumpDistance });
      if (distance(from, candidate) > insectRules.jumpDistance * .65 && clear(from, candidate)) { target = candidate; break; }
    }
    move(insect, target, now, insectRules.jumpMs);
    insect.nextJumpAt = now + insectRules.jumpCooldownMs; changed = true;
  }
  return changed;
}

export function nextInsectEvent(state: LoungeRoomState, now: number) {
  if (!state.players.length) return Infinity;
  return Math.min((state.lastInsectAt ?? now - insectRules.spawnIntervalMs) + insectRules.spawnIntervalMs,
    ...(state.insects ?? []).flatMap((insect) => [insect.expiresAt,
      ["mantis", "bee", "butterfly"].includes(insect.kind) ? insect.nextMoveAt : Infinity,
      insect.kind === "grasshopper" ? insect.nextJumpAt > now ? insect.nextJumpAt : state.players.some((player) => player.move.endsAt > now) ? now + 100 : Infinity : Infinity]));
}

export function applyInsectCommand(state: LoungeRoomState, player: LoungeStoredPlayer, command: Extract<LoungeCommandInput, { type: "collectInsect" | "releaseInsect" }>, now: number, secret: string) {
  const reason = interactionBlock(player, now);
  if (reason) return reason;
  if (command.type === "releaseInsect") { player.insectHeld = false; return null; }
  const insect = state.insects?.find((insect) => insect.id === command.insectId && insect.expiresAt > now);
  if (!insect) return "이미 사라졌거나 다른 사람이 채집한 곤충이에요.";
  if (distance(positionAt(player, now), insectPositionAt(insect, now)) > insectRules.captureRange) return "곤충에게 조금 더 가까이 다가가 주세요.";
  const point = positionAt(player, now);
  player.move = { from: point, to: point, startedAt: now, endsAt: now };
  player.lastInsect = { id: insect.id, kind: insect.kind, sizeCm: insect.sizeCm, caughtAt: now };
  player.lastInsect.receipt = signCatch(player.lastInsect, player.tokenHash, now, secret, "insects");
  player.insectHeld = true; player.fishHeld = false; player.heldFoodId = null;
  player.action = { id: randomUUID(), kind: "collectInsect", startedAt: now, endsAt: now + insectRules.collectMs };
  state.insects = state.insects!.filter((item) => item.id !== insect.id);
  return null;
}
