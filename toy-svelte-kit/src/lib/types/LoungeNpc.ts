import type { Vector3 } from "three";
import type { LoungeMove, LoungePoint } from "./Lounge";
import type { LoungeCharacterVisual } from "./LoungeCharacter";

export type LoungeNpc = { id: string; move: LoungeMove; waypoint: number; nextMoveAt: number; paused: boolean };
export type LoungeSceneNpc = { npc: LoungeNpc; visual: LoungeCharacterVisual; label: HTMLDivElement; head: Vector3; point: LoungePoint; facing: number };
