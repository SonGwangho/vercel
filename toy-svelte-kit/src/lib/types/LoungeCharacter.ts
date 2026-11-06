import type { Bone, Group, Matrix4, Quaternion, Vector3 } from "three";
import type { LoungeAction, LoungeFoodKind } from "./Lounge";
import type { LoungeAppearance } from "./LoungeAppearance";
import type { LoungeSitting } from "./LoungeSeating";

export type LoungeCharacterPose = {
  now: number;
  delta: number;
  speed: number;
  stunned: boolean;
  reducedMotion: boolean;
  action: LoungeAction | null;
  peer: Vector3 | null;
  carried: LoungeFoodKind | null | undefined;
  carryingFish: boolean;
  carryingInsect?: boolean;
  sitting?: LoungeSitting | null;
};
export type LoungeCharacterVisual = {
  group: Group;
  appearance: (value: LoungeAppearance) => void;
  pose: (state: LoungeCharacterPose) => void;
  grip: (matrix: Matrix4, left?: boolean, twoHanded?: boolean) => void;
  label: (point: Vector3) => void;
  dispose: () => void;
};
export type LoungeChibiJoint = {
  bone: Bone;
  rotation: Quaternion;
  parentRotation: Quaternion;
  inverseParentRotation: Quaternion;
};

export type LoungeChibiLimb = {
  upper: Bone;
  lower: Bone;
  end: Bone;
  upperAxis: Vector3;
  lowerAxis: Vector3;
  upperLength: number;
  lowerLength: number;
  endRotation: Quaternion;
  forward: Vector3;
  palmAxis: Vector3;
  restEnd: Vector3;
};
