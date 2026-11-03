export type LoungePoint = { x: number; y: number };
export type LoungeFoodKind = "rice" | "chicken" | "pizza";
export type LoungeFoodDefinition = { kind: LoungeFoodKind; name: string };
export type LoungeChannel = { id: string; name: string; description: string; capacity: number };
export type LoungeChannelSummary = LoungeChannel & { count: number };
export type LoungeProfile = { nickname: string; color: string; channelId: string };
export type LoungeSession = { channelId: string; playerId: string; token: string };
export type LoungeMove = { from: LoungePoint; to: LoungePoint; startedAt: number; endsAt: number };
export type LoungeFood = { id: string; kind: LoungeFoodKind };
export type LoungeGroundFood = LoungeFood & LoungePoint & { createdAt: number };
export type LoungeConsentKind = "handshake" | "hug" | "give";
export type LoungeActionKind = LoungeConsentKind | "punch" | "hit" | "eat" | "pickup";
export type LoungeAction = {
  id: string;
  kind: LoungeActionKind;
  startedAt: number;
  endsAt: number;
  peerId?: string;
  foodKind?: LoungeFoodKind;
};
export type LoungePlayer = {
  id: string;
  nickname: string;
  color: string;
  move: LoungeMove;
  inventory: LoungeFood[];
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
export type LoungeNotice = { id: string; text: string; createdAt: number };
export type LoungeRoomState = {
  players: LoungeStoredPlayer[];
  foods: LoungeGroundFood[];
  requests: LoungeRequest[];
  messages: LoungeMessage[];
  notices: LoungeNotice[];
  lastFoodAt: number;
  appliedCommands: { id: string; playerId: string }[];
};
export type LoungeRoomRow = { channel_id: string; revision: number | string; state: LoungeRoomState };
export type LoungeSnapshot = {
  channel: LoungeChannel;
  revision: number;
  serverNow: number;
  players: LoungePlayer[];
  foods: LoungeGroundFood[];
  requests: LoungeRequest[];
  messages: LoungeMessage[];
  notices: LoungeNotice[];
};
export type LoungeJoinInput = { channelId: string; nickname: string; color: string };
export type LoungeJoinResult = { session: LoungeSession; snapshot: LoungeSnapshot };
export type LoungeCommandInput =
  | { type: "move"; x: number; y: number }
  | { type: "chat"; text: string }
  | { type: "interact"; kind: LoungeConsentKind | "punch"; targetId: string; foodId?: string }
  | { type: "respond"; requestId: string; accept: boolean }
  | { type: "cancel"; requestId: string }
  | { type: "pickup"; foodId: string }
  | { type: "eat"; foodId: string }
  | { type: "leave" };
export type LoungeCommand = LoungeCommandInput & { commandId: string };
export type LoungeAvatarProps = { color: string; walking?: boolean; action?: LoungeActionKind | null; stunned?: boolean; size?: number };
export type LoungeFoodIconProps = { kind: LoungeFoodKind; size?: number };
export type LoungeRenderedPlayer = LoungePlayer & LoungePoint & { walking: boolean; stunned: boolean; busy: boolean };
export type LoungeMenuTarget = { kind: "player" | "food"; id: string; x: number; y: number };
export type LoungeBubble = { id: string; playerId: string; nickname: string; text: string; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number };
export type LoungeRoomClientState = "connecting" | "connected" | "reconnecting" | "expired";
export type LoungeRoomMutation = (state: LoungeRoomState, now: number) => boolean;
export type LoungeRoomProps = { channel: LoungeChannel };
export type LoungeRect = { x: number; y: number; width: number; height: number };
export type LoungeNameLabel = LoungeRect & { playerId: string; nickname: string; color: string; anchorX: number; anchorY: number; self: boolean };
