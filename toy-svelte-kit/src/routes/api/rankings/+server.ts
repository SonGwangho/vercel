import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { createRanking, listRankings } from "$lib/server/rankings";
import type {
	RankingCreateRequest,
	RankingListResponse,
	RankingMutationResponse
} from "$lib";

function badRequest(message: string, status = 400) {
	return json({ message }, { status });
}

export const GET: RequestHandler = async ({ url }) => {
	const gameCodeText = url.searchParams.get("gameCode");
	const limitText = url.searchParams.get("limit");
	const gameCode = Number(gameCodeText);
	const limit = limitText ? Number(limitText) : 10;

	if (!gameCodeText || !Number.isInteger(gameCode)) {
		return badRequest("gameCode query parameter is required.");
	}

	if (!Number.isInteger(limit) || limit <= 0) {
		return badRequest("limit must be a positive integer.");
	}

	try {
		const rankings = await listRankings(gameCode, limit);
		const body: RankingListResponse = { rankings };
		return json(body);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to load rankings.";
		return json({ message }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	let payload: RankingCreateRequest;

	try {
		payload = (await request.json()) as RankingCreateRequest;
	} catch {
		return badRequest("Invalid JSON body.");
	}

	try {
		const ranking = await createRanking(payload);
		const body: RankingMutationResponse = { ranking };
		return json(body, { status: 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to create ranking.";
		const status = message.includes("required") || message.includes("must be") ? 400 : 500;
		return json({ message }, { status });
	}
};
