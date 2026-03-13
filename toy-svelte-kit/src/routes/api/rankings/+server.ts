import type { RequestHandler } from "./$types";

import { handleRankingCollectionRequest } from "$lib/server/api/rankings";
import { withApiHook } from "$lib/server/hooks/api";

const getRankings: RequestHandler = async (event) => {
	return handleRankingCollectionRequest(event);
};

const createRanking: RequestHandler = async (event) => {
	return handleRankingCollectionRequest(event);
};

export const GET = withApiHook(getRankings);
export const POST = withApiHook(createRanking);
