import camp from "../assets/data/lounge/campground.json";
import { clampPosition, distance, loungeWorld } from "./shared";
import type { LoungeMove, LoungePoint } from "../types/Lounge";

const obstacles = camp.obstacles.map((item) => ({ x: loungeWorld.width / 2 + item.x * 100, y: loungeWorld.height / 2 + item.z * 100, radius: item.radius * 100 + 24 }));
const points = obstacles.flatMap((circle) => Array.from({ length: 12 }, (_, index) => ({ x: circle.x + Math.cos(index * Math.PI / 6) * (circle.radius / Math.cos(Math.PI / 12) + 4), y: circle.y + Math.sin(index * Math.PI / 6) * (circle.radius / Math.cos(Math.PI / 12) + 4) })));
function clear(a: LoungePoint, b: LoungePoint) {
  const dx = b.x - a.x; const dy = b.y - a.y; const length = dx * dx + dy * dy;
  return obstacles.every((circle) => {
    const t = length ? Math.max(0, Math.min(1, ((circle.x - a.x) * dx + (circle.y - a.y) * dy) / length)) : 0;
    return Math.hypot(a.x + dx * t - circle.x, a.y + dy * t - circle.y) >= circle.radius - 0.1;
  });
}
const edges = points.map((point, index) => points.map((other, next) => index !== next && clear(point, other) ? distance(point, other) : Infinity));

export function walkablePoint(point: LoungePoint): LoungePoint {
  const result = clampPosition(point);
  for (const circle of obstacles) {
    const length = distance(result, circle);
    if (length < circle.radius + 1) {
      const angle = length > 0.001 ? Math.atan2(result.y - circle.y, result.x - circle.x) : Math.PI / 2;
      result.x = circle.x + Math.cos(angle) * (circle.radius + 1); result.y = circle.y + Math.sin(angle) * (circle.radius + 1);
    }
  }
  return clampPosition(result);
}

export function planMove(origin: LoungePoint, destination: LoungePoint, now: number): LoungeMove {
  const from = walkablePoint(origin); const to = walkablePoint(destination);
  let path = [to];
  if (!clear(from, to)) {
    const nodes = [from, ...points, to]; const last = nodes.length - 1;
    const costs = nodes.map(() => Infinity); const previous = nodes.map(() => -1); const visited = new Set<number>(); costs[0] = 0;
    for (let step = 0; step < nodes.length; step += 1) {
      let current = -1;
      for (let n = 0; n < nodes.length; n += 1) if (!visited.has(n) && (current < 0 || costs[n] < costs[current])) current = n;
      if (current < 0 || !Number.isFinite(costs[current]) || current === last) break;
      visited.add(current);
      for (let next = 1; next < nodes.length; next += 1) {
        if (visited.has(next)) continue;
        const length = current > 0 && next < last ? edges[current - 1][next - 1] : clear(nodes[current], nodes[next]) ? distance(nodes[current], nodes[next]) : Infinity;
        if (costs[current] + length < costs[next]) { costs[next] = costs[current] + length; previous[next] = current; }
      }
    }
    if (previous[last] < 0) return { from, to: from, startedAt: now, endsAt: now };
    path = []; for (let n = last; n > 0; n = previous[n]) path.unshift(nodes[n]);
  }
  let length = 0; let cursor = from;
  for (const point of path) { length += distance(cursor, point); cursor = point; }
  return { from, to, path, startedAt: now, endsAt: now + length / loungeWorld.speed * 1000 };
}
