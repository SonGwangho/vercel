import { walkablePoint } from "../../lounge/navigation";
import { distance, interactionSpacingFor, loungeRules, positionAt } from "../../lounge/shared";
import type { LoungeConsentKind, LoungePairPositions, LoungePlayer, LoungePoint } from "../../types/Lounge";

export function arrangeSocialPlayers(first: LoungePlayer, second: LoungePlayer, kind: LoungeConsentKind, now: number): boolean {
  if (kind !== "handshake" && kind !== "hug") return true;
  const a = positionAt(first, now); const b = positionAt(second, now);
  const wanted = interactionSpacingFor(kind);
  if (Math.abs(distance(a, b) - wanted) <= 6) return true;
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const initial = Math.atan2(a.y - b.y, a.x - b.x);
  let best: LoungePairPositions | null = null; let cost = Infinity;
  for (let n = 0; n < 24; n += 1) {
    const angle = initial + n * Math.PI / 12;
    const dx = Math.cos(angle) * wanted / 2; const dy = Math.sin(angle) * wanted / 2;
    const p = walkablePoint({ x: center.x + dx, y: center.y + dy });
    const q = walkablePoint({ x: center.x - dx, y: center.y - dy });
    const gap = distance(p, q); const moved = distance(p, a) + distance(q, b);
    if (gap >= wanted - 2 && gap <= wanted + 14 && moved < cost) { best = { first: p, second: q }; cost = moved; }
  }
  if (!best) for (let n = 0; n < 24; n += 1) {
    const angle = initial + n * Math.PI / 12;
    const p = walkablePoint({ x: b.x + Math.cos(angle) * wanted, y: b.y + Math.sin(angle) * wanted });
    const gap = distance(p, b); const moved = distance(p, a);
    if (gap >= wanted - 2 && gap <= loungeRules.socialRange && moved < cost) { best = { first: p, second: b }; cost = moved; }
  }
  if (!best) return false;
  const put = (player: LoungePlayer, point: LoungePoint) => { player.move = { from: point, to: point, startedAt: now, endsAt: now }; };
  put(first, best.first); put(second, best.second);
  return true;
}
