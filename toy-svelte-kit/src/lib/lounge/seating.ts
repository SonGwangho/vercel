import camp from "../assets/data/lounge/campground.json";
import config from "../assets/data/lounge/seating.json";
import { clear, planMove, walkablePoint } from "./navigation";
import { clampPosition, distance, loungeWorld } from "./shared";
import type { LoungeMove, LoungePlayer, LoungePoint } from "../types/Lounge";
import type { LoungeBench, LoungeLog, LoungeSeat, LoungeSitting } from "../types/LoungeSeating";

export const seatingRules = config;
export const loungeLogs: LoungeLog[] = camp.logs.map((log, index) => ({ ...log, id: `log-${index}` }));
export const loungeBenches: LoungeBench[] = config.benchOffsets.map((offset, index) => ({ id: `bench-${index}`, x: camp.picnic.x, z: camp.picnic.z + offset / 100 }));
const logSeats: LoungeSeat[] = loungeLogs.flatMap((log) => {
  const cx = loungeWorld.width / 2 + log.x * 100, cy = loungeWorld.height / 2 + log.z * 100;
  const sign = Math.cos(log.rotation) * -log.x + Math.sin(log.rotation) * log.z >= 0 ? 1 : -1;
  const normal = { x: Math.cos(log.rotation) * sign, y: -Math.sin(log.rotation) * sign };
  return config.slotOffsets.map((offset, index): LoungeSeat => {
    const point = { x: cx + Math.sin(log.rotation) * offset, y: cy + Math.cos(log.rotation) * offset };
    return { id: `${log.id}:${index}`, kind: "log", fixtureId: log.id, point, height: config.logHeight, facing: Math.atan2(normal.x, normal.y),
      approach: walkablePoint({ x: point.x - normal.x * config.approachDistance, y: point.y - normal.y * config.approachDistance }) };
  });
});
const benchSeats: LoungeSeat[] = loungeBenches.flatMap((bench, index) => config.benchSlotOffsets.map((offset, slot): LoungeSeat => {
  const side = Math.sign(config.benchOffsets[index]);
  const point = { x: loungeWorld.width / 2 + bench.x * 100 + offset, y: loungeWorld.height / 2 + bench.z * 100 };
  return { id: `${bench.id}:${slot}`, kind: "bench", fixtureId: bench.id, point, height: config.benchHeight, facing: side < 0 ? 0 : Math.PI,
    approach: walkablePoint({ x: point.x, y: point.y + side * config.approachDistance }) };
}));
export const loungeSeats: LoungeSeat[] = [...logSeats, ...benchSeats];
const restingObstacles = [...camp.obstacles, camp.lake].map((item) => ({ x: loungeWorld.width / 2 + item.x * 100, y: loungeWorld.height / 2 + item.z * 100, radius: item.radius * 100 + config.lyingObstaclePadding }));
export const findSeat = (id?: string) => loungeSeats.find((seat) => seat.id === id);
export function availableSeat(fixtureId: string, players: LoungePlayer[], from: LoungePoint, selfId?: string) {
  return loungeSeats.filter((seat) => seat.fixtureId === fixtureId && !players.some((player) => player.id !== selfId && player.sitting?.seatId === seat.id))
    .sort((a, b) => distance(from, a.approach) - distance(from, b.approach))[0];
}
export function groundSeatAllowed(point: LoungePoint): boolean {
  return clear(point, point) && !loungeLogs.some((log) => {
    const dx = point.x - loungeWorld.width / 2 - log.x * 100, dy = point.y - loungeWorld.height / 2 - log.z * 100;
    const across = dx * Math.cos(log.rotation) - dy * Math.sin(log.rotation);
    const along = dx * Math.sin(log.rotation) + dy * Math.cos(log.rotation);
    return Math.abs(across) < config.logHalfWidth && Math.abs(along) < config.logHalfLength;
  }) && !loungeBenches.some((bench) => Math.abs(point.x - loungeWorld.width / 2 - bench.x * 100) < config.benchHalfLength && Math.abs(point.y - loungeWorld.height / 2 - bench.z * 100) < config.benchHalfWidth);
}

function lyingOverlapsBox(point: LoungePoint, facing: number, center: LoungePoint, halfWidth: number, halfLength: number, rotation: number): boolean {
  const axes = [[Math.sin(facing), Math.cos(facing), config.lyingHalfLength], [Math.cos(facing), -Math.sin(facing), config.lyingHalfWidth]];
  const boxAxes = [[Math.cos(rotation), -Math.sin(rotation), halfWidth], [Math.sin(rotation), Math.cos(rotation), halfLength]];
  return [...axes, ...boxAxes].every(([x, y]) => {
    const projection = (vectors: number[][]) => vectors.reduce((sum, [vx, vy, extent]) => sum + Math.abs(x * vx + y * vy) * extent, 0);
    return Math.abs((point.x - center.x) * x + (point.y - center.y) * y) < projection(axes) + projection(boxAxes);
  });
}

export function lyingAllowed(point: LoungePoint, facing: number): boolean {
  if (!Number.isFinite(facing)) return false;
  const sx = Math.sin(facing), sy = Math.cos(facing);
  for (const along of [-1, 1]) for (const side of [-1, 1]) {
    const sample = { x: point.x + sx * along * config.lyingHalfLength + sy * side * config.lyingHalfWidth,
      y: point.y + sy * along * config.lyingHalfLength - sx * side * config.lyingHalfWidth };
    if (distance(sample, clampPosition(sample)) > 1) return false;
  }
  if (restingObstacles.some((circle) => {
    const dx = circle.x - point.x, dy = circle.y - point.y;
    const along = Math.max(0, Math.abs(dx * sx + dy * sy) - config.lyingHalfLength);
    const across = Math.max(0, Math.abs(dx * sy - dy * sx) - config.lyingHalfWidth);
    return Math.hypot(along, across) < circle.radius;
  })) return false;
  if (loungeLogs.some((log) => lyingOverlapsBox(point, facing, { x: loungeWorld.width / 2 + log.x * 100, y: loungeWorld.height / 2 + log.z * 100 }, config.logHalfWidth, config.logHalfLength, log.rotation))) return false;
  return !loungeBenches.some((bench) => lyingOverlapsBox(point, facing, { x: loungeWorld.width / 2 + bench.x * 100, y: loungeWorld.height / 2 + bench.z * 100 }, config.benchHalfLength, config.benchHalfWidth, 0));
}

export function seatedMove(from: LoungePoint, sitting: LoungeSitting | null | undefined, destination: LoungePoint, now: number): LoungeMove {
  const seat = sitting?.kind === "log" || sitting?.kind === "bench" ? findSeat(sitting.seatId) : undefined;
  if (!seat) return planMove(from, destination, now);
  const next = planMove(seat.approach, destination, now);
  const path = [seat.approach, ...(next.path ?? [next.to])];
  let length = 0, cursor = from;
  for (const point of path) { length += distance(cursor, point); cursor = point; }
  const speed = length >= loungeWorld.runDistance ? loungeWorld.speed : loungeWorld.walkSpeed;
  return { from, to: next.to, path, startedAt: now, endsAt: now + length / speed * 1000 };
}
