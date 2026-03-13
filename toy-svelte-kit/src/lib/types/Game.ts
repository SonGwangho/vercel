import type { RankingListItem } from "./Ranking";

export type GameCodeEntry = {
	id: string;
	name: string;
	path: string;
	order: number;
	gameCode: number;
	gameName: string;
	hasRanking: boolean;
};

export type GameCodeListResponse = {
	games: GameCodeEntry[];
};

export type GameRankingBoard = {
	game: GameCodeEntry;
	rankings: RankingListItem[];
};
