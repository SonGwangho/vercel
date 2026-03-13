import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { deleteRanking, getRankingById, updateRanking } from "$lib/server/rankings";
import type {
	RankingDeleteResponse,
	RankingMutationResponse,
	RankingUpdateRequest
} from "$lib";

function parseId(idText: string): number | null {
	const id = Number(idText);
	return Number.isInteger(id) && id > 0 ? id : null;
}

export const GET: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);

	if (id === null) {
		return json({ message: "Invalid ranking id." }, { status: 400 });
	}

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
};

export const PATCH: RequestHandler = async ({ params, request }) => {
	const id = parseId(params.id);

	if (id === null) {
		return json({ message: "Invalid ranking id." }, { status: 400 });
	}

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
};

export const DELETE: RequestHandler = async ({ params }) => {
	const id = parseId(params.id);

	if (id === null) {
		return json({ message: "Invalid ranking id." }, { status: 400 });
	}

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
};
