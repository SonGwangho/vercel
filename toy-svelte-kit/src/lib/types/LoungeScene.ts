import type { Group, InstancedMesh, Vector3 } from "three";
import type { LoungeAction, LoungeActionKind, LoungeFoodKind, LoungeMenuTarget, LoungeMove, LoungePlayer, LoungePoint, LoungeSnapshot } from "./Lounge";

export type LoungeRigPart = "head" | "hair" | "body" | "leftArm" | "rightArm" | "leftHand" | "rightHand" | "leftLeg" | "rightLeg" | "leftShoe" | "rightShoe" | "leftEye" | "rightEye" | "mouth" | "shadow";
export type LoungeRig = Record<LoungeRigPart, InstancedMesh>;
export type LoungeSceneActor = {
  player: LoungePlayer;
  point: LoungePoint;
  correction: LoungePoint;
  facing: number;
  head: Vector3;
  label: HTMLButtonElement;
  nameOffset: LoungePoint;
  nameWidth: number;
  actionId: string | null;
  held: Group | null;
  heldKind: LoungeFoodKind | null;
};
export type LoungeSceneFood = { group: Group; point: LoungePoint; createdAt: number; phase: number };
export type LoungeSceneBubble = { element: HTMLDivElement; playerId: string; offset: LoungePoint };
export type LoungeSceneParticle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; color: number; size: number };
export type LoungeScenePrediction = { action: LoungeAction; commandId: string; point: LoungePoint; hiddenFoodId?: string };
export type LoungeSceneOptions = {
  selfId: string;
  getNow: () => number;
  onMove: (point: LoungePoint) => void;
  onContext: (target: LoungeMenuTarget) => void;
  onHover: (label: string) => void;
  onError: (message: string) => void;
};
export type LoungeSceneController = {
  update: (snapshot: LoungeSnapshot) => void;
  move: (point: LoungePoint) => void;
  rejectMove: () => void;
  position: () => LoungePoint | null;
  predict: (kind: LoungeActionKind, commandId: string, foodKind?: LoungeFoodKind, foodId?: string, peerId?: string) => void;
  settle: (commandId: string, accepted: boolean) => void;
  say: (text: string, commandId: string) => void;
  finishSay: (commandId: string) => void;
  setMuted: (muted: boolean) => void;
  setTheme: (dark: boolean) => void;
  zoom: (delta: number) => void;
  selfScreen: () => LoungePoint;
  unlockAudio: () => void;
  dispose: () => void;
};
export type LoungeScenePick = { kind: "player" | "food"; id: string };
export type LoungeSceneLocalMove = LoungeMove;
