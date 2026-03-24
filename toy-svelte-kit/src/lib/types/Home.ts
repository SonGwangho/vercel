import type { GameCodeEntry } from "./Game";
import type { RankingListItem } from "./Ranking";

export type HomeRankingBoardState = {
	game: GameCodeEntry;
	rankings: RankingListItem[];
	loading: boolean;
	error: boolean;
};