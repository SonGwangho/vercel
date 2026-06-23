import type { GameCodeEntry } from "./Game";

export type RankingRecord = {
	id: number;
	gameCode: number;
	gameName: string;
	userName: string;
	score: number;
	createdAt: string;
	updatedAt: string;
};

export type RankingListItem = RankingRecord & {
	rank: number;
};

export type RankingCreateRequest = {
	gameCode: number;
	gameName: string;
	userName: string;
	score: number;
};

export type RankingUpdateRequest = Partial<Pick<RankingCreateRequest, "gameName" | "userName" | "score">>;

export type RankingListResponse = {
	rankings: RankingListItem[];
};

export type RankingBoard = {
	game: GameCodeEntry;
	rankings: RankingListItem[];
};

export type RankingBoardListResponse = {
	boards: RankingBoard[];
};

export type RankingMutationResponse = {
	ranking: RankingRecord;
};

export type RankingDeleteResponse = {
	deleted: boolean;
	id: number;
};
