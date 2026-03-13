import { json, type RequestEvent } from "@sveltejs/kit";

import { createRanking, deleteRanking, getRankingById, listRankings, updateRanking } from "$lib/server/rankings";
import type {
	RankingCreateRequest,
	RankingDeleteResponse,
	RankingListResponse,
	RankingMutationResponse,
	RankingUpdateRequest
} from "$lib";

type ApiRequestEvent = Pick<RequestEvent, "params" | "request" | "url">;

function badRequest(message: string, status = 400) {
	return json({ message }, { status });
}

function parseId(idText: string): number | null {
	const id = Number(idText);
	return Number.isInteger(id) && id > 0 ? id : null;
}

export async function handleRankingCollectionRequest({ request, url }: ApiRequestEvent): Promise<Response> {
	if (request.method === "GET") {
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
	}

	if (request.method === "POST") {
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
	}

	return json({ message: "Method not allowed." }, { status: 405 });
}

export async function handleRankingItemRequest({ params, request }: ApiRequestEvent): Promise<Response> {
	const id = parseId(params.id ?? "");

	if (id === null) {
		return json({ message: "Invalid ranking id." }, { status: 400 });
	}

	if (request.method === "GET") {
		try {
			const ranking = await getRankingById(id);

			if (!ranking) {
				return json({ message: "Ranking not found." }, { status: 404 });
			}

			const body: RankingMutationResponse = { ranking };
			return json(body);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load ranking.";
			return json({ message }, { status: 500 });
		}
	}

	if (request.method === "PATCH") {
		let payload: RankingUpdateRequest;

		try {
			payload = (await request.json()) as RankingUpdateRequest;
		} catch {
			return json({ message: "Invalid JSON body." }, { status: 400 });
		}

		try {
			const ranking = await updateRanking(id, payload);

			if (!ranking) {
				return json({ message: "Ranking not found." }, { status: 404 });
			}

			const body: RankingMutationResponse = { ranking };
			return json(body);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to update ranking.";
			const status = message.includes("must be") ? 400 : 500;
			return json({ message }, { status });
		}
	}

	if (request.method === "DELETE") {
		try {
			const deleted = await deleteRanking(id);

			if (!deleted) {
				return json({ message: "Ranking not found." }, { status: 404 });
			}

			const body: RankingDeleteResponse = {
				deleted: true,
				id
			};

			return json(body);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to delete ranking.";
			return json({ message }, { status: 500 });
		}
	}

	return json({ message: "Method not allowed." }, { status: 405 });
}
