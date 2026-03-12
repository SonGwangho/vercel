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
