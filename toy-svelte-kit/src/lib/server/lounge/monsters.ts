import { randomUUID } from "node:crypto";
import { clear, planMove, walkablePoint } from "../../lounge/navigation";
import { describeMonster, monsterChance, monsterPositionAt, monsterPunchRange, monsterRules, monsterSpecies } from "../../lounge/monsters";
import { distance, interactionBlock, loungeRules, loungeWorld, positionAt } from "../../lounge/shared";
import { dropHeldFood } from "./food";
import type { LoungePoint, LoungeRoomState, LoungeStoredPlayer } from "../../types/Lounge";
import type { LoungeMonsterSpecies, LoungeStoredMonster } from "../../types/LoungeMonster";

function stop(monster: LoungeStoredMonster, now: number) {
  const point = monsterPositionAt(monster, now);
  monster.move = { from: point, to: point, startedAt: now, endsAt: now };
}

export function hibernateMonsters(state: LoungeRoomState, now: number): boolean {
  if (state.monstersDormantAt) return false;
  state.monstersDormantAt = now;
  state.lastMonsterSpawnAt = now;
  for (const monster of state.monsters ?? []) { stop(monster, now); monster.attack = undefined; monster.targetId = undefined; monster.returning = false; }
  return true;
}

function spawn(state: LoungeRoomState, species: LoungeMonsterSpecies, now: number): LoungeStoredMonster | null {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const margin = loungeWorld.padding + species.radius;
    const point = { x: margin + Math.random() * (loungeWorld.width - margin * 2), y: margin + Math.random() * (loungeWorld.height - margin * 2) };
    const footprint = Array.from({ length: 8 }, (_, i) => ({ x: point.x + Math.cos(i * Math.PI / 4) * species.radius, y: point.y + Math.sin(i * Math.PI / 4) * species.radius }));
    if (!clear(point, point) || footprint.some((edge) => !clear(edge, edge)) || state.players.some((player) => distance(positionAt(player, now), point) < species.radius + 160)
      || state.monsters?.some((monster) => distance(monsterPositionAt(monster, now), point) < species.radius + describeMonster(monster.kind).radius + 80)) continue;
    return { id: randomUUID(), kind: species.kind, hp: species.hp, maxHp: species.hp, home: point,
      move: { from: point, to: point, startedAt: now, endsAt: now }, contributors: [], lastHitAt: 0, nextThinkAt: now, nextAttackAt: now + 1200, nextRoamAt: now + 1800 };
  }
  return null;
}

function seek(monster: LoungeStoredMonster, destination: LoungePoint, now: number, speedRatio = 1) {
  const species = describeMonster(monster.kind);
  const move = planMove(monsterPositionAt(monster, now), destination, now);
  let length = 0; let point = move.from;
  for (const next of move.path ?? [move.to]) { length += distance(point, next); point = next; }
  move.endsAt = now + length / (species.speed * speedRatio) * 1000;
  monster.move = move;
}

const roamPause = () => monsterRules.roamPauseMinMs + Math.random() * (monsterRules.roamPauseMaxMs - monsterRules.roamPauseMinMs);

function wander(state: LoungeRoomState, monster: LoungeStoredMonster, now: number) {
  const from = monsterPositionAt(monster, now), species = describeMonster(monster.kind);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const margin = loungeWorld.padding + species.radius;
    const goal = { x: margin + Math.random() * (loungeWorld.width - margin * 2), y: margin + Math.random() * (loungeWorld.height - margin * 2) };
    const gap = distance(from, goal);
    if (gap < monsterRules.roamMinDistance || gap > monsterRules.roamMaxDistance || !clear(goal, goal)) continue;
    const edges = Array.from({ length: 8 }, (_, i) => ({ x: goal.x + Math.cos(i * Math.PI / 4) * species.radius, y: goal.y + Math.sin(i * Math.PI / 4) * species.radius }));
    if (edges.some((point) => !clear(point, point)) || state.monsters?.some((other) => other.id !== monster.id && distance(monsterPositionAt(other, now), goal) < species.radius + describeMonster(other.kind).radius + 40)) continue;
    seek(monster, goal, now, monsterRules.roamSpeedRatio);
    if (distance(monster.move.from, monster.move.to) < 8) continue;
    monster.home = from;
    monster.nextRoamAt = monster.move.endsAt + roamPause();
    return;
  }
  monster.nextRoamAt = now + roamPause();
}

function impact(state: LoungeRoomState, monster: LoungeStoredMonster, now: number) {
  const attack = monster.attack!;
  attack.landed = true;
  monster.move = { from: attack.to, to: attack.from, startedAt: attack.impactAt, endsAt: attack.endsAt };
  const target = state.players.find((player) => player.id === attack.targetId);
  if (!target || target.stunnedUntil > now || (target.stunImmuneUntil ?? 0) > now) return;
  const point = positionAt(target, now);
  if (distance(point, attack.to) > describeMonster(monster.kind).radius + 50 || !clear(attack.to, point)) return;
  for (const request of state.requests.filter((request) => request.fromId === target.id || request.toId === target.id)) {
    for (const player of state.players) if (player.pendingRequestId === request.id) player.pendingRequestId = null;
  }
  state.requests = state.requests.filter((request) => request.fromId !== target.id && request.toId !== target.id);
  const source = { ...target, move: monster.move };
  dropHeldFood(state, target, source, now);
  target.move = { from: point, to: point, startedAt: now, endsAt: now };
  target.fishHeld = false; target.insectHeld = false;
  target.sitting = null;
  target.stunnedUntil = now + loungeRules.stunMs;
  target.stunImmuneUntil = target.stunnedUntil + monsterRules.stunImmunityMs;
  target.action = { id: randomUUID(), kind: "hit", startedAt: now, endsAt: target.stunnedUntil, peerId: monster.id };
}

export function maintainMonsters(state: LoungeRoomState, now: number): boolean {
  let changed = false;
  state.monsters ??= [];
  state.monsterRewards ??= [];
  state.lastMonsterSpawnAt ??= now;
  for (const monster of state.monsters) {
    if (monster.lastHitAt && now - monster.lastHitAt >= monsterRules.healAfterMs) {
      monster.hp = monster.maxHp; monster.contributors = []; monster.lastHitAt = 0;
      changed = true;
    }
    if (describeMonster(monster.kind).passive && !monster.lastHitAt && (monster.targetId || monster.attack)) {
      stop(monster, now);
      monster.targetId = undefined; monster.attack = undefined; monster.returning = false;
      monster.nextThinkAt = now; monster.nextRoamAt = now + roamPause();
      changed = true;
    }
  }
  if (!state.players.length) {
    return hibernateMonsters(state, now) || changed;
  }
  if (state.monstersDormantAt) {
    state.monstersDormantAt = undefined; state.lastMonsterSpawnAt = now;
    for (const monster of state.monsters) { monster.nextThinkAt = now; monster.nextAttackAt = now + 1200; monster.nextRoamAt = now + roamPause(); monster.returning = false; }
    changed = true;
  }
  if (now - state.lastMonsterSpawnAt >= monsterRules.spawnIntervalMs) {
    const candidates = monsterSpecies.filter((species) => !state.monsters!.some((monster) => monster.kind === species.kind) && Math.random() < monsterChance(species));
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    for (const species of candidates) {
      if (state.monsters.length >= monsterRules.maxFieldMonsters) break;
      const monster = spawn(state, species, now);
      if (monster) state.monsters.push(monster);
    }
    state.lastMonsterSpawnAt = now; changed = true;
  }
  for (const monster of state.monsters) {
    const species = describeMonster(monster.kind);
    if (monster.attack) {
      if (!monster.attack.landed && now >= monster.attack.impactAt) { impact(state, monster, now); changed = true; }
      if (now < monster.attack.endsAt) continue;
      monster.attack = undefined; changed = true;
    }
    if (now < monster.nextThinkAt) continue;
    monster.nextThinkAt = now + monsterRules.thinkIntervalMs;
    const point = monsterPositionAt(monster, now);
    if (monster.returning) {
      if (monster.move.endsAt > now) continue;
      monster.returning = false; monster.nextRoamAt = now + roamPause(); changed = true;
    }
    let target = state.players.find((player) => player.id === monster.targetId);
    if (monster.targetId && (!target || distance(monster.home, positionAt(target, now)) > monsterRules.leashRange || (species.passive && !monster.lastHitAt))) {
      monster.targetId = undefined; monster.returning = true;
      seek(monster, monster.home, now); monster.nextRoamAt = monster.move.endsAt + roamPause(); changed = true;
      continue;
    }
    if (!target && !species.passive) target = [...state.players].sort((a, b) => distance(point, positionAt(a, now)) - distance(point, positionAt(b, now)))
      .find((player) => distance(point, positionAt(player, now)) <= monsterRules.aggroRange + species.radius);
    if (monster.targetId !== target?.id) { monster.targetId = target?.id; if (target) monster.home = point; changed = true; }
    if (!target) {
      if (now >= (monster.nextRoamAt ?? 0)) { wander(state, monster, now); changed = true; }
      continue;
    }
    const destination = positionAt(target, now);
    const gap = distance(point, destination);
    if (gap <= species.radius + monsterRules.attackReach && now >= monster.nextAttackAt && clear(point, destination)) {
      const ratio = Math.max(0, gap - 20) / Math.max(1, gap);
      const to = walkablePoint({ x: point.x + (destination.x - point.x) * ratio, y: point.y + (destination.y - point.y) * ratio });
      const releaseAt = now + monsterRules.windupMs, impactAt = releaseAt + monsterRules.chargeMs;
      monster.move = { from: point, to, startedAt: releaseAt, endsAt: impactAt };
      monster.attack = { id: randomUUID(), targetId: target.id, from: point, to, startedAt: now, impactAt, endsAt: impactAt + monsterRules.recoveryMs, landed: false };
      monster.nextAttackAt = now + monsterRules.attackCooldownMs; changed = true;
    } else if (gap > species.radius + 45) {
      const spacing = species.radius + 45;
      const goal = { x: destination.x + (point.x - destination.x) / Math.max(1, gap) * spacing, y: destination.y + (point.y - destination.y) / Math.max(1, gap) * spacing };
      if (monster.move.endsAt <= now || distance(monster.move.to, goal) > 50) { seek(monster, goal, now); changed = true; }
    }
  }
  return changed;
}

export function nextMonsterEvent(state: LoungeRoomState, now: number): number {
  const recovery = (state.monsters ?? []).filter((monster) => monster.lastHitAt > 0).map((monster) => monster.lastHitAt + monsterRules.healAfterMs);
  if (!state.players.length) return Math.min(Infinity, ...recovery);
  return Math.min((state.lastMonsterSpawnAt ?? now) + monsterRules.spawnIntervalMs, ...recovery,
    ...(state.monsters ?? []).map((monster) => monster.attack ? monster.attack.landed ? monster.attack.endsAt : monster.attack.impactAt : Math.max(now + monsterRules.thinkIntervalMs, monster.nextThinkAt)));
}

export function punchMonster(state: LoungeRoomState, player: LoungeStoredPlayer, monsterId: string, now: number): string | null {
  const blocked = interactionBlock(player, now);
  if (blocked) return blocked;
  if (!player.encyclopediaHash) return "도감을 연결하고 있어요. 잠시 후 다시 시도해 주세요.";
  if (now - (player.lastMonsterPunchAt ?? 0) < monsterRules.punchCooldownMs) return "펀치를 준비하고 있어요.";
  const monster = state.monsters?.find((monster) => monster.id === monsterId && monster.hp > 0);
  if (!monster) return "이미 처치된 몬스터예요.";
  const point = positionAt(player, now), target = monsterPositionAt(monster, now);
  if (distance(point, target) > monsterPunchRange(monster) || !clear(point, target)) return "몬스터에게 조금 더 가까이 다가가 주세요.";
  player.move = { from: point, to: point, startedAt: now, endsAt: now };
  player.action = { id: randomUUID(), kind: "punch", startedAt: now, endsAt: now + monsterRules.punchCooldownMs, peerId: monster.id };
  player.heldFoodId = null; player.fishHeld = false; player.insectHeld = false; player.lastMonsterPunchAt = now;
  player.sitting = null;
  if (!monster.targetId) monster.home = target;
  monster.hp = Math.max(0, monster.hp - monsterRules.punchDamage); monster.lastHitAt = now; monster.targetId = player.id; monster.returning = false;
  if (!monster.contributors.includes(player.encyclopediaHash)) monster.contributors.push(player.encyclopediaHash);
  if (monster.hp > 0) return null;
  state.monsterRewards ??= [];
  for (const tokenHash of monster.contributors) state.monsterRewards.push({ id: monster.id, kind: monster.kind, tokenHash, defeatedAt: now });
  for (const participant of state.players) if (participant.encyclopediaHash && monster.contributors.includes(participant.encyclopediaHash)) participant.monsterBookPending = true;
  state.monsters = state.monsters!.filter((item) => item.id !== monster.id);
  state.notices.push({ id: randomUUID(), text: `${describeMonster(monster.kind).name} 처치! 함께 타격한 유저의 도감에 기록하고 있어요.`, createdAt: now });
  return null;
}
