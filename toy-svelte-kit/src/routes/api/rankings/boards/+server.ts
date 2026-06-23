import { json, type RequestHandler } from "@sveltejs/kit";

import { listRankedGames } from "$lib/gameCodes";
import { listRankings } from "$lib/server/rankings";
import { withApiHook } from "$lib/server/hooks/api";
import type { RankingBoardListResponse } from "$lib";

const getRankingBoards: RequestHandler = async (event) => {
	const limitText = event.url.searchParams.get("limit");
	const limit = limitText ? Number(limitText) : 5;

	if (!Number.isInteger(limit) || limit <= 0) {
		return json({ message: "limit must be a positive integer." }, { status: 400 });
	}

	const games = listRankedGames();
	const boards = await Promise.all(
		games.map(async (game) => ({
			game,
			rankings: await listRankings(game.gameCode, limit)
		}))
	);
	const body: RankingBoardListResponse = { boards };

	return json(body);
};

export const GET = withApiHook(getRankingBoards);
