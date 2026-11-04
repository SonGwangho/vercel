import type { LoungeAppearance } from "./LoungeAppearance";
import type { LoungeFieldInsect, LoungeInsectCatch } from "./LoungeInsect";

export type LoungePoint = { x: number; y: number };
export type LoungePairPositions = { first: LoungePoint; second: LoungePoint };
export type LoungeFoodKind = "rice" | "chicken" | "pizza";
export type LoungeFoodDefinition = { kind: LoungeFoodKind; name: string };
export type LoungeChannel = { id: string; name: string; description: string; capacity: number };
export type LoungeChannelSummary = LoungeChannel & { count: number };
export type LoungeProfile = { nickname: string; color: string; channelId: string; appearance?: LoungeAppearance };
export type LoungeSession = { channelId: string; playerId: string; token: string };
export type LoungeMove = { from: LoungePoint; to: LoungePoint; path?: LoungePoint[]; startedAt: number; endsAt: number };
export type LoungeFood = { id: string; kind: LoungeFoodKind };
export type LoungeGroundFood = LoungeFood & LoungePoint & { createdAt: number; droppedFrom?: LoungePoint };
export type LoungeConsentKind = "handshake" | "hug" | "give";
export type LoungeEmoteKind = "middleFinger" | "laugh" | "dance" | "scratchHead" | "tongueOut";
export type LoungeEmoteDefinition = { kind: LoungeEmoteKind; name: string; durationMs: number };
export type LoungeFishKind = "carp" | "flounder" | "snapper" | "eel" | "whale" | "shark";
export type LoungeFishGrade = "C" | "B" | "A" | "S" | "SS" | "SSS";
export type LoungeFishVertex = readonly [x: number, y: number, z: number];
export type LoungeFishSection = readonly [x: number, y: number, height: number, depth: number, z?: number];
export type LoungeFishIconProps = { kind: LoungeFishKind };
export type LoungeFishSpecies = { kind: LoungeFishKind; name: string; grade: LoungeFishGrade; weight: number; minCm: number; maxCm: number; color: string };
export type LoungeFishCatch = { id: string; kind: LoungeFishKind; sizeCm: number; caughtAt?: number; receipt?: string };
export type LoungeFishingGauge = { center: number; width: number; readyAt?: number };
export type LoungeFishingMotion = { windup: number; release: number; flight: number; pull: number; lift: number; recovery: number };
export type LoungeFishingCommand =
  | { type: "cast" }
  | { type: "reel"; actionId: string; pressedAt: number }
  | { type: "releaseFish"; catchId: string }
  | { type: "stopFishing"; actionId: string };
export type LoungeActionKind = LoungeConsentKind | LoungeEmoteKind | "punch" | "hit" | "eat" | "pickup" | "fish" | "fishCatch" | "collectInsect";
export type LoungeAction = {
  id: string;
  kind: LoungeActionKind;
  startedAt: number;
  endsAt: number;
  peerId?: string;
  foodKind?: LoungeFoodKind;
  giveRole?: "giver" | "receiver";
  fishing?: LoungeFishingGauge;
};
export type LoungePlayer = {
  id: string;
  nickname: string;
  color: string;
  appearance?: LoungeAppearance;
  move: LoungeMove;
  inventory: LoungeFood[];
  heldFoodId?: string | null;
  lastCatch?: LoungeFishCatch;
  pendingCatch?: LoungeFishCatch | null;
  catches?: LoungeFishCatch[];
  fishHeld?: boolean;
  lastInsect?: LoungeInsectCatch;
  insectHeld?: boolean;
  action: LoungeAction | null;
  pendingRequestId: string | null;
  stunnedUntil: number;
  joinedAt: number;
};
export type LoungeStoredPlayer = LoungePlayer & {
  tokenHash: string;
  lastSeenAt: number;
  lastCommandAt: number;
  lastChatAt: number;
  lastActivityAt?: number;
  lastMoveCommandId?: string;
};
export type LoungeRequest = {
  id: string;
  kind: LoungeConsentKind;
  fromId: string;
  toId: string;
  foodId?: string;
  foodKind?: LoungeFoodKind;
  createdAt: number;
  expiresAt: number;
};
export type LoungeMessage = { id: string; playerId: string; nickname: string; text: string; createdAt: number };
export type LoungeChatHistoryProps = {
  messages: LoungeMessage[];
  selfId: string;
  open: boolean;
  onClose: () => void;
  onCompose: () => void;
  onUnread: (count: number) => void;
};
export type LoungeNotice = { id: string; text: string; createdAt: number };
export type LoungeRoomState = {
  players: LoungeStoredPlayer[];
  foods: LoungeGroundFood[];
  requests: LoungeRequest[];
  messages: LoungeMessage[];
  notices: LoungeNotice[];
  lastFoodAt: number;
  insects?: LoungeFieldInsect[];
  lastInsectAt?: number;
  appliedCommands: { id: string; playerId: string }[];
};
export type LoungeRoomRow = { channel_id: string; revision: number | string; state: LoungeRoomState };
export type LoungeRoomCache = { row: LoungeRoomRow; expiresAt: number };
export type LoungeSnapshot = {
  channel: LoungeChannel;
  revision: number;
  serverNow: number;
  processingMs?: number;
  epoch?: string;
  players: LoungePlayer[];
  foods: LoungeGroundFood[];
  insects?: LoungeFieldInsect[];
  requests: LoungeRequest[];
  messages: LoungeMessage[];
  notices: LoungeNotice[];
};
export type LoungeJoinInput = { channelId: string; nickname: string; color: string; appearance?: LoungeAppearance };
export type LoungeJoinResult = { session: LoungeSession; snapshot: LoungeSnapshot };
export type LoungeSyncResult = LoungeSnapshot | { unchanged: true; revision: number; serverNow: number; processingMs?: number };
export type LoungeCommandInput =
  | LoungeFishingCommand
  | { type: "collectInsect"; insectId: string }
  | { type: "releaseInsect" }
  | { type: "move"; x: number; y: number }
  | { type: "chat"; text: string }
  | { type: "emote"; kind: LoungeEmoteKind }
  | { type: "stopEmote" }
  | { type: "interact"; kind: LoungeConsentKind | "punch"; targetId: string; foodId?: string }
  | { type: "respond"; requestId: string; accept: boolean }
  | { type: "cancel"; requestId: string }
  | { type: "pickup"; foodId: string }
  | { type: "equip"; foodId: string }
  | { type: "stow" }
  | { type: "eat"; foodId: string }
  | { type: "leave" };
export type LoungeCommand = LoungeCommandInput & { commandId: string };
export type LoungeAvatarProps = { color: string; walking?: boolean; action?: LoungeActionKind | null; stunned?: boolean; size?: number };
export type LoungeFoodIconProps = { kind: LoungeFoodKind; size?: number };
export type LoungeRenderedPlayer = LoungePlayer & LoungePoint & { walking: boolean; stunned: boolean; busy: boolean };
export type LoungeMenuTarget = { kind: "player" | "food" | "lake" | "insect"; id: string; x: number; y: number };
export type LoungeBubble = { id: string; playerId: string; nickname: string; text: string; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; zIndex: number };
export type LoungeRoomClientState = "connecting" | "connected" | "reconnecting" | "expired";
export type LoungeRoomMutation = (state: LoungeRoomState, now: number) => boolean;
export type LoungeRoomProps = { channel: LoungeChannel };
export type LoungeApproach = {
  input: Extract<LoungeCommandInput, { type: "pickup" | "interact" | "cast" | "collectInsect" }>;
  target: LoungePoint;
  startedAt: number;
  lastSentAt: number;
};
export type LoungeFishingProps = {
  action: LoungeAction;
  now: number;
  getNow: () => number;
  disabled: boolean;
  onReel: () => void;
  onCancel: () => void;
};
export type LoungeRect = { x: number; y: number; width: number; height: number };
export type LoungeNameLabel = LoungeRect & { playerId: string; nickname: string; color: string; anchorX: number; anchorY: number; self: boolean };
