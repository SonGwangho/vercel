import camp from "../assets/data/lounge/campground.json";
import fishing from "../assets/data/lounge/fishing.json";
import type { LoungeAction, LoungeFishCatch, LoungeFishKind, LoungeFishingMotion, LoungeFishSpecies, LoungePoint } from "../types/Lounge";
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

export function fishDisplayLength(sizeCm: number) {
  const { baseLength, metreLength, largeScale, maxLength } = fishingRules.display;
  const metres = Math.max(0, sizeCm) / 100;
  return Math.min(maxLength, baseLength + (metreLength - baseLength) * Math.min(1, metres)
    + largeScale * Math.log(Math.max(1, metres)));
}

export function fishDisplayOffset(sizeCm: number) {
  return .035 + Math.max(0, fishDisplayLength(sizeCm) - .8) * fishingRules.display.forwardPerMetre;
}

export function catchLabel(fish: LoungeFishCatch) {
  const species = describeFish(fish.kind);
  return `${species.grade}등급 ${species.name} · ${fishLength(fish.sizeCm)}`;
}

const restingMotion: LoungeFishingMotion = { windup: 0, release: 0, flight: 1, pull: 0, lift: 0, recovery: 0 };
function ease(value: number, from: number, to: number) {
  const progress = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return progress * progress * (3 - 2 * progress);
}

export function fishingMotion(action: LoungeAction | null, now: number): LoungeFishingMotion {
  if (action?.kind === "fish") {
    const duration = (action.fishing?.readyAt ?? action.startedAt) - action.startedAt;
    const phase = duration > 0 ? Math.max(0, (now - action.startedAt) / duration) : 1;
    return {
      windup: ease(phase, 0, .35) * (1 - ease(phase, .35, .6)),
      release: ease(phase, .35, .58) * (1 - ease(phase, .7, 1)),
      flight: ease(phase, .43, 1),
      pull: 0, lift: 0, recovery: 0
    };
  }
  if (action?.kind === "fishCatch") {
    const phase = Math.max(0, (now - action.startedAt) / Math.max(1, action.endsAt - action.startedAt));
    return {
      windup: 0, release: 0, flight: 1,
      pull: ease(phase, 0, .25),
      lift: ease(phase, .12, .9),
      recovery: ease(phase, .75, 1)
    };
  }
  return restingMotion;
}
