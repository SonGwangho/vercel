export type AppleGameConfig = {
  rows: number;
  cols: number;
  targetSum: number;
  minValue: number;
  maxValue: number;
  appleImage?: string;
  palette: string[];
};

export type AppleGameCell = {
  id: number;
  value: number;
};

export type AppleGameProps = { vertical?: boolean };
export type AppleEndReason = "clear" | "timeout" | null;
export type AppleSelectionBox = { left: number; top: number; width: number; height: number };
export type ApplePointerPoint = { x: number; y: number };
export type AppleBoardCell = AppleGameCell & {
  row: number;
  col: number;
  removed: boolean;
  style: string;
};

export type AppleScoreRequest = {
  userName: string;
  gameName: string;
  gameCode: number;
  score: number;
};

export type AppleRankingItem = {
  rank: number;
  userName: string;
  score: number;
  gameName?: string;
};
