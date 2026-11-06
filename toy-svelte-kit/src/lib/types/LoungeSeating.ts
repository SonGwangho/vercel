import type { LoungePoint } from "./Lounge";

export type LoungeSitting = { kind: "ground" | "log" | "lying"; seatId?: string; facing: number; startedAt: number };
export type LoungeLog = { id: string; x: number; z: number; rotation: number };
export type LoungeSeat = { id: string; logId: string; point: LoungePoint; approach: LoungePoint; facing: number; height: number };
