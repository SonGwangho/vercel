import type { Group } from "three";
import type { LoungeFishGrade, LoungeMove, LoungePoint } from "./Lounge";

export type LoungeInsectKind = "caterpillar" | "mantis" | "grasshopper" | "bee" | "butterfly" | "rhinoBeetle";
export type LoungeInsectSpecies = { kind: LoungeInsectKind; name: string; grade: LoungeFishGrade; minCm: number; maxCm: number; color: string; fieldScale: number; weight: number };
export type LoungeFieldInsect = { id: string; kind: LoungeInsectKind; sizeCm: number; spawnedAt: number; expiresAt: number; move: LoungeMove; nextMoveAt: number; nextJumpAt: number; seed: number };
export type LoungeInsectCatch = { id: string; kind: LoungeInsectKind; sizeCm: number; caughtAt: number; receipt?: string };
export type LoungeInsectVisual = { group: Group; insect: LoungeFieldInsect; point: LoungePoint; facing: number };
export type LoungeInsectIconProps = { kind: LoungeInsectKind };
export type LoungeInsectVertex = readonly [number, number, number];
