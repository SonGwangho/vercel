import type { LoungeMove, LoungePlayer } from "./Lounge";

export type LoungeNpcPatrol = { id: string; move: LoungeMove; waypoint: number; nextMoveAt: number; paused: boolean };
export type LoungeNpcInput = LoungeNpcPatrol & Partial<LoungePlayer>;
export type LoungeNpc = LoungePlayer & LoungeNpcPatrol;
