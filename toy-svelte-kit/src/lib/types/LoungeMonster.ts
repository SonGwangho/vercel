import type { Group, MeshStandardMaterial } from "three";
import type { LoungeFishGrade, LoungeMove, LoungePoint } from "./Lounge";

export type LoungeMonsterKind = "hornRabbit" | "wolf" | "bear" | "tiger" | "griffin" | "easternDragon";
export type LoungeMonsterSpecies = { kind: LoungeMonsterKind; name: string; grade: LoungeFishGrade; hp: number; scale: number; radius: number; color: string; passive: boolean; speed: number };
export type LoungeMonsterAttack = { id: string; targetId: string; from: LoungePoint; to: LoungePoint; startedAt: number; impactAt: number; endsAt: number; landed: boolean };
export type LoungeMonster = { id: string; kind: LoungeMonsterKind; hp: number; maxHp: number; home: LoungePoint; move: LoungeMove; lastHitAt: number; targetId?: string; attack?: LoungeMonsterAttack; nextThinkAt: number; nextAttackAt: number };
export type LoungeStoredMonster = LoungeMonster & { contributors: string[] };
export type LoungeMonsterReward = { id: string; kind: LoungeMonsterKind; tokenHash: string; defeatedAt: number };
export type LoungeMonsterRecord = { defeatedAt: number };
export type LoungeMonsterVisual = { monster: LoungeMonster; group: Group; point: LoungePoint; facing: number; label: HTMLButtonElement; bar: HTMLElement; health: HTMLElement; materials: MeshStandardMaterial[] };
export type LoungeMonsterIconProps = { kind: LoungeMonsterKind };
