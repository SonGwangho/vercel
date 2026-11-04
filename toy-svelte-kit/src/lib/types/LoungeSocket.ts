import type { LoungeChannelSummary, LoungeCommand, LoungeJoinInput, LoungeJoinResult, LoungePlayer, LoungeRoomState, LoungeSession, LoungeSnapshot } from "./Lounge";
import type { WebSocket } from "ws";

export type LoungeReplica = { channelId: string; epoch: string; revision: number; state: LoungeRoomState };
export type LoungeSocketPatch = Pick<LoungeSnapshot, "revision" | "serverNow" | "epoch"> & {
  channelId: string; baseRevision: number;
  players: LoungePlayer[]; removed: string[];
  foods?: LoungeSnapshot["foods"]; requests?: LoungeSnapshot["requests"];
  insects?: LoungeSnapshot["insects"];
  messages?: LoungeSnapshot["messages"]; notices?: LoungeSnapshot["notices"];
  messageChanges?: { added: LoungeSnapshot["messages"]; removed: string[] };
};
export type LoungeSocketOperation =
  | { op: "join"; input: LoungeJoinInput; token?: string }
  | { op: "resume"; session: LoungeSession }
  | { op: "command"; session: LoungeSession; command: LoungeCommand }
  | { op: "touch"; session: LoungeSession; activity: boolean };
export type LoungeSocketRequest = { id: string } & (LoungeSocketOperation | { op: "channels" } | { op: "ping"; sentAt: number });
export type LoungeSocketResult = LoungeJoinResult | LoungeSnapshot | { channels: LoungeChannelSummary[] } | { applied: true; channelId: string; epoch?: string; revision: number };
export type LoungeSocketFrame =
  | { type: "result"; id: string; result: LoungeSocketResult }
  | { type: "error"; id?: string; status: number; message: string }
  | { type: "snapshot"; snapshot: LoungeSnapshot }
  | { type: "patch"; patch: LoungeSocketPatch }
  | { type: "ack"; id: string; serverNow: number }
  | { type: "pong"; sentAt: number; serverNow: number };
export type LoungeSocketMember = { socket: WebSocket; session: LoungeSession | null; joining: boolean; alive: boolean; count: number; windowAt: number; ageTimer: ReturnType<typeof setTimeout> };
export type LoungeRelayEnvelope =
  | { kind: "request"; source: string; id: string; operation: LoungeSocketOperation }
  | { kind: "result"; target: string; id: string; result?: LoungeSocketResult; error?: { status: number; message: string } }
  | { kind: "state"; source: string; replica: LoungeReplica }
  | { kind: "release"; source: string; channelId: string; replica: LoungeReplica };
export type LoungeRelayPart = { source: string; id: string; index: number; total: number; data: string };
export type LoungeRelayAssembly = { parts: string[]; total: number; received: number; createdAt: number };
export type LoungeRelayPending = { resolve: (value: LoungeSocketResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
export type LoungeClientPending = { resolve: (value: LoungeSocketResult | null) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; cleanup: () => void };
export type LoungeSocketHandlers = { onState: (snapshot: LoungeSnapshot) => void; onStatus: (status: "connecting" | "connected" | "reconnecting" | "expired") => void; onClock: (serverNow: number, sentAt: number) => void; onExpired: (message: string) => void };
