import type {
	RankingBoardListResponse,
	RankingCreateRequest,
	RankingListResponse,
	RankingMutationResponse
} from "../types/Ranking";

import { fetchJson } from "./api";

export function loadRankingBoards(limit: number): Promise<RankingBoardListResponse> {
	const searchParams = new URLSearchParams({
		limit: String(limit)
	});

	return fetchJson<RankingBoardListResponse>(`/api/rankings/boards?${searchParams.toString()}`);
}

export function loadRankings(gameCode: number, limit: number): Promise<RankingListResponse> {
	const searchParams = new URLSearchParams({
		gameCode: String(gameCode),
		limit: String(limit)
	});

	return fetchJson<RankingListResponse>(`/api/rankings?${searchParams.toString()}`);
}

export function createRanking(input: RankingCreateRequest): Promise<RankingMutationResponse> {
	return fetchJson<RankingMutationResponse>("/api/rankings", {
		method: "POST",
		headers: {
			"content-type": "application/json"
		},
		body: JSON.stringify(input)
	});
}
