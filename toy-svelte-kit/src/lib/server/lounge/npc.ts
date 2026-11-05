import settings from "../../assets/data/lounge/npc.json";
import { planMove, walkablePoint } from "../../lounge/navigation";
import { distance, loungeWorld, positionAt } from "../../lounge/shared";
import { normalizeNpc } from "../../lounge/npc";
import type { LoungeRoomState } from "../../types/Lounge";

const waypoints = settings.waypoints.map((point) => walkablePoint({ x: loungeWorld.width / 2 + point.x, y: loungeWorld.height / 2 + point.y }));
const pause = () => settings.pauseMinMs + Math.random() * (settings.pauseMaxMs - settings.pauseMinMs);

export function hibernateNpc(state: LoungeRoomState, now: number): boolean {
  const npc = state.npc;
  if (!npc || npc.paused) return false;
  const point = positionAt(npc, now);
  npc.move = { from: point, to: point, startedAt: now, endsAt: now };
  npc.paused = true;
  return true;
}

export function maintainNpc(state: LoungeRoomState, now: number): boolean {
  let changed = false;
  if (state.npc && !Array.isArray(state.npc.inventory)) { state.npc = normalizeNpc(state.npc); changed = true; }
  if (!state.players.length) return hibernateNpc(state, now) || changed;
  if (!state.npc) {
    const point = waypoints[0];
    state.npc = normalizeNpc({ id: settings.id, move: { from: point, to: point, startedAt: now, endsAt: now }, waypoint: 0, nextMoveAt: now + pause(), paused: false });
    return true;
  }
  const npc = state.npc;
  if (npc.paused) { npc.paused = false; npc.nextMoveAt = now + pause(); changed = true; }
  if (npc.action) {
    const peer = state.players.find((player) => player.id === npc.action?.peerId);
    const social = ["handshake", "hug", "give"].includes(npc.action.kind);
    if (npc.action.endsAt > now && (!social || peer?.action?.kind === npc.action.kind && peer.action.peerId === npc.id && peer.action.startedAt === npc.action.startedAt)) return changed;
    npc.action = null; npc.nextMoveAt = Math.max(now, npc.stunnedUntil) + pause(); changed = true;
  }
  if (npc.stunnedUntil > now) return changed;
  if (now < npc.nextMoveAt) return changed;
  const from = positionAt(npc, now);
  const waypoint = distance(from, waypoints[npc.waypoint]) > 8 ? npc.waypoint : (npc.waypoint + 1) % waypoints.length;
  const move = planMove(from, waypoints[waypoint], now);
  let length = 0, cursor = move.from;
  for (const point of move.path ?? [move.to]) { length += distance(cursor, point); cursor = point; }
  move.endsAt = now + length / settings.speed * 1000;
  npc.move = move; npc.waypoint = waypoint; npc.nextMoveAt = move.endsAt + pause();
  return true;
}

export function nextNpcEvent(state: LoungeRoomState): number {
  const npc = state.npc;
  if (!state.players.length || !npc || npc.paused) return Infinity;
  if (npc.action) return npc.action.endsAt;
  return Math.max(npc.nextMoveAt, npc.stunnedUntil);
}
