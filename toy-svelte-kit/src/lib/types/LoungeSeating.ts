import type { LoungePoint } from "./Lounge";

export type LoungeSitting = { kind: "ground" | "log" | "bench" | "lying"; seatId?: string; facing: number; startedAt: number };
export type LoungeLog = { id: string; x: number; z: number; rotation: number };
export type LoungeBench = { id: string; x: number; z: number };
export type LoungeSeat = { id: string; kind: "log" | "bench"; fixtureId: string; point: LoungePoint; approach: LoungePoint; facing: number; height: number };
