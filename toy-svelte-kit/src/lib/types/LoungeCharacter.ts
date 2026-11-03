import type { Group, Matrix4, Vector3 } from "three";
import type { LoungeAction, LoungeFoodKind } from "./Lounge";
import type { LoungeAppearance } from "./LoungeAppearance";

export type LoungeCharacterPose = {
  now: number; joinedAt: number; movingSince: number;
  walking: boolean; stunned: boolean; reducedMotion: boolean;
  action: LoungeAction | null;
  carried: LoungeFoodKind | null | undefined;
};
export type LoungeCharacterVisual = {
  group: Group;
  appearance: (value: LoungeAppearance) => void;
  pose: (state: LoungeCharacterPose) => void;
  grip: (matrix: Matrix4) => void;
  label: (point: Vector3) => void;
  dispose: () => void;
};
