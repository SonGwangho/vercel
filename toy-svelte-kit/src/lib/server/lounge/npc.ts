import settings from "../../assets/data/lounge/npc.json";
import { planMove, walkablePoint } from "../../lounge/navigation";
import { distance, loungeWorld, positionAt } from "../../lounge/shared";
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
  if (!state.players.length) return hibernateNpc(state, now);
  if (!state.npc) {
    const point = waypoints[0];
    state.npc = { id: settings.id, move: { from: point, to: point, startedAt: now, endsAt: now }, waypoint: 0, nextMoveAt: now + pause(), paused: false };
    return true;
  }
  const npc = state.npc;
  if (npc.paused) { npc.paused = false; npc.nextMoveAt = now + pause(); return true; }
  if (now < npc.nextMoveAt) return false;
  const from = positionAt(npc, now);
  const waypoint = distance(from, waypoints[npc.waypoint]) > 8 ? npc.waypoint : (npc.waypoint + 1) % waypoints.length;
  const move = planMove(from, waypoints[waypoint], now);
  let length = 0, cursor = move.from;
  for (const point of move.path ?? [move.to]) { length += distance(cursor, point); cursor = point; }
  move.endsAt = now + length / settings.speed * 1000;
  npc.move = move; npc.waypoint = waypoint; npc.nextMoveAt = move.endsAt + pause();
  return true;
}

export function nextNpcEvent(state: LoungeRoomState): number { return state.players.length && state.npc && !state.npc.paused ? state.npc.nextMoveAt : Infinity; }
