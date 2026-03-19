import { json, type RequestHandler } from "@sveltejs/kit";

import { requireAdminSession } from "$lib/server/adminAccess";
import { listAdminRankings } from "$lib/server/rankings";
import type { AdminRankingListResponse } from "$lib";
import { withApiHook } from "$lib/server/hooks/api";

const getAdminRankings: RequestHandler = async (event) => {
	requireAdminSession(event);

	const gameCodeText = event.url.searchParams.get("gameCode");
	const limitText = event.url.searchParams.get("limit");
	const gameCode = gameCodeText ? Number(gameCodeText) : undefined;
	const limit = limitText ? Number(limitText) : 100;

	if (gameCodeText && !Number.isInteger(gameCode)) {
		return json({ message: "gameCode must be an integer." }, { status: 400 });
	}

	if (!Number.isInteger(limit) || limit <= 0) {
		return json({ message: "limit must be a positive integer." }, { status: 400 });
	}

	const rankings = await listAdminRankings({ gameCode, limit });
	const body: AdminRankingListResponse = { rankings };
	return json(body);
};

export const GET = withApiHook(getAdminRankings);
