import camp from "../assets/data/lounge/campground.json";
import config from "../assets/data/lounge/seating.json";
import { clear, planMove, walkablePoint } from "./navigation";
import { clampPosition, distance, loungeWorld } from "./shared";
import type { LoungeMove, LoungePlayer, LoungePoint } from "../types/Lounge";
import type { LoungeLog, LoungeSeat, LoungeSitting } from "../types/LoungeSeating";

export const seatingRules = config;
export const loungeLogs: LoungeLog[] = camp.logs.map((log, index) => ({ ...log, id: `log-${index}` }));
export const loungeSeats: LoungeSeat[] = loungeLogs.flatMap((log) => {
  const cx = loungeWorld.width / 2 + log.x * 100, cy = loungeWorld.height / 2 + log.z * 100;
  const sign = Math.cos(log.rotation) * -log.x + Math.sin(log.rotation) * log.z >= 0 ? 1 : -1;
  const normal = { x: Math.cos(log.rotation) * sign, y: -Math.sin(log.rotation) * sign };
  return config.slotOffsets.map((offset, index) => {
    const point = { x: cx + Math.sin(log.rotation) * offset, y: cy + Math.cos(log.rotation) * offset };
    return { id: `${log.id}:${index}`, logId: log.id, point, height: config.logHeight, facing: Math.atan2(normal.x, normal.y),
      approach: walkablePoint({ x: point.x - normal.x * config.approachDistance, y: point.y - normal.y * config.approachDistance }) };
  });
});
export const findSeat = (id?: string) => loungeSeats.find((seat) => seat.id === id);
export function availableSeat(logId: string, players: LoungePlayer[], from: LoungePoint, selfId?: string) {
  return loungeSeats.filter((seat) => seat.logId === logId && !players.some((player) => player.id !== selfId && player.sitting?.seatId === seat.id))
    .sort((a, b) => distance(from, a.approach) - distance(from, b.approach))[0];
}
export const groundFacing = (point: LoungePoint) => Math.atan2(loungeWorld.width / 2 - point.x, loungeWorld.height / 2 - point.y);
export function groundSeatAllowed(point: LoungePoint): boolean {
  return clear(point, point) && !loungeLogs.some((log) => {
    const dx = point.x - loungeWorld.width / 2 - log.x * 100, dy = point.y - loungeWorld.height / 2 - log.z * 100;
    const across = dx * Math.cos(log.rotation) - dy * Math.sin(log.rotation);
    const along = dx * Math.sin(log.rotation) + dy * Math.cos(log.rotation);
    return Math.abs(across) < config.logHalfWidth && Math.abs(along) < config.logHalfLength;
  });
}

export function lyingAllowed(point: LoungePoint): boolean {
  const facing = groundFacing(point), sx = Math.sin(facing), sy = Math.cos(facing);
  for (const along of [-1, -.5, 0, .5, 1]) for (const side of [-1, 0, 1]) {
    const sample = { x: point.x + sx * along * config.lyingHalfLength + sy * side * config.lyingHalfWidth,
      y: point.y + sy * along * config.lyingHalfLength - sx * side * config.lyingHalfWidth };
    if (distance(sample, clampPosition(sample)) > 1 || !groundSeatAllowed(sample)) return false;
  }
  return true;
}

export function seatedMove(from: LoungePoint, sitting: LoungeSitting | null | undefined, destination: LoungePoint, now: number): LoungeMove {
  const seat = sitting?.kind === "log" ? findSeat(sitting.seatId) : undefined;
  if (!seat) return planMove(from, destination, now);
  const next = planMove(seat.approach, destination, now);
  const path = [seat.approach, ...(next.path ?? [next.to])];
  let length = 0, cursor = from;
  for (const point of path) { length += distance(cursor, point); cursor = point; }
  const speed = length >= loungeWorld.runDistance ? loungeWorld.speed : loungeWorld.walkSpeed;
  return { from, to: next.to, path, startedAt: now, endsAt: now + length / speed * 1000 };
}
