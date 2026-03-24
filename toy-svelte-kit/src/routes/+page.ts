import type { PageLoad } from "./$types";

import type { CurrentWeather, GameCodeListResponse, GameRankingBoard, RankingListResponse } from "$lib";

const HOME_RANKING_LIMIT = 5;

export const load: PageLoad = async ({ fetch, data }) => {
	try {
		const codesResponse = await fetch("/api/games/codes");

		if (!codesResponse.ok) {
			return {
				weather: (data.weather ?? null) as CurrentWeather | null,
				rankingBoards: [] as GameRankingBoard[]
			};
		}

		const codesData = (await codesResponse.json()) as GameCodeListResponse;
		const rankedGames = codesData.games.filter((game) => game.hasRanking);
		const boardResults = await Promise.all(
			rankedGames.map(async (game) => {
				try {
					const rankingResponse = await fetch(
						`/api/rankings?gameCode=${game.gameCode}&limit=${HOME_RANKING_LIMIT}`
					);

					if (!rankingResponse.ok) {
						return {
							game,
							rankings: []
						} satisfies GameRankingBoard;
					}

					const rankingData = (await rankingResponse.json()) as RankingListResponse;
					return {
						game,
						rankings: rankingData.rankings
					} satisfies GameRankingBoard;
				} catch {
					return {
						game,
						rankings: []
					} satisfies GameRankingBoard;
				}
			})
		);

		return {
			weather: (data.weather ?? null) as CurrentWeather | null,
			rankingBoards: boardResults
		};
	} catch {
		return {
			weather: (data.weather ?? null) as CurrentWeather | null,
			rankingBoards: [] as GameRankingBoard[]
		};
	}
};