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
