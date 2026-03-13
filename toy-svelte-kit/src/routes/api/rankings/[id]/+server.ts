import type { RequestHandler } from "./$types";

import { handleRankingItemRequest } from "$lib/server/api/rankings";
import { withApiHook } from "$lib/server/hooks/api";

const getRanking: RequestHandler = async (event) => {
	return handleRankingItemRequest(event);
};

const patchRanking: RequestHandler = async (event) => {
	return handleRankingItemRequest(event);
};

const deleteRanking: RequestHandler = async (event) => {
	return handleRankingItemRequest(event);
};

export const GET = withApiHook(getRanking);
export const PATCH = withApiHook(patchRanking);
export const DELETE = withApiHook(deleteRanking);
