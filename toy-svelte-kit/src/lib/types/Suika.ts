export type SuikaFruitDefinition = {
  level: number;
  name: string;
  color: string;
  radius: number;
  score: number;
};

export type SuikaScoreRequest = {
  userName: string;
  gameName: string;
  gameCode: number;
  score: number;
};

export type SuikaRankingItem = {
  rank: number;
  userName: string;
  score: number;
  gameName?: string;
};

export type SuikaStatus = "idle" | "running" | "over";
export type SuikaFruitBody = {
  id: number;
  level: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mergedAt: number;
};
