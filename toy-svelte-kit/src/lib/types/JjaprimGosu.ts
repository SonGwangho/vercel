export type JjaprimGosuScoreRequest = {
  userName: string;
  gameName: string;
  gameCode: number;
  score: number;
};

export type JjaprimGosuRankingItem = {
  rank: number;
  userName: string;
  score: number;
  gameName?: string;
};

export type JjaprimGosuRankingResponse = {
  rankings: JjaprimGosuRankingItem[];
};

export type JjaprimGosuStatus = "idle" | "running" | "dead";
export type JjaprimGosuArrow = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  rotation: number;
};
