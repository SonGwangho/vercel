import camp from "../assets/data/lounge/campground.json";
import fishing from "../assets/data/lounge/fishing.json";
import type { LoungeFishCatch, LoungeFishKind, LoungeFishSpecies, LoungePoint } from "../types/Lounge";
import { distance, loungeWorld } from "./shared";

export const lake = camp.lake;
export const fishingRules = fishing;
export const fishSpecies = fishing.species as LoungeFishSpecies[];
export const lakeCenter = { x: loungeWorld.width / 2 + lake.x * 100, y: loungeWorld.height / 2 + lake.z * 100 };
export const fishingSpot = { x: lakeCenter.x + lake.radius * 100 + 52, y: lakeCenter.y };

export function canFishFrom(point: LoungePoint) {
  const gap = distance(point, lakeCenter) - lake.radius * 100;
  return gap >= 20 && gap <= fishingRules.shoreReach;
}

export function gaugePosition(startedAt: number, now: number) {
  const phase = (Math.max(0, now - startedAt) % fishingRules.cycleMs) / fishingRules.cycleMs;
  return 1 - Math.abs(phase * 2 - 1);
}

export function describeFish(kind: LoungeFishKind) {
  return fishSpecies.find((fish) => fish.kind === kind)!;
}

export function fishLength(sizeCm: number) {
  return sizeCm >= 100 ? `${sizeCm / 100} m` : `${sizeCm} cm`;
}

export function catchLabel(fish: LoungeFishCatch) {
  const species = describeFish(fish.kind);
  return `${species.grade}등급 ${species.name} · ${fishLength(fish.sizeCm)}`;
}
