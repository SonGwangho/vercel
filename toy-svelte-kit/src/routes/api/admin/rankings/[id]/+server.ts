import { json, type RequestHandler } from "@sveltejs/kit";

import { requireAdminSession } from "$lib/server/adminAccess";
import { deleteRanking, updateRanking } from "$lib/server/rankings";
import type { RankingDeleteResponse, RankingMutationResponse, RankingUpdateRequest } from "$lib";
import { withApiHook } from "$lib/server/hooks/api";

function parseId(idText: string): number | null {
	const id = Number(idText);
	return Number.isInteger(id) && id > 0 ? id : null;
}

const patchAdminRanking: RequestHandler = async (event) => {
	requireAdminSession(event);

	const id = parseId(event.params.id ?? "");
	if (id === null) {
		return json({ message: "Invalid ranking id." }, { status: 400 });
	}

	let payload: RankingUpdateRequest;
	try {
		payload = (await event.request.json()) as RankingUpdateRequest;
	} catch {
		return json({ message: "Invalid JSON body." }, { status: 400 });
	}

	const ranking = await updateRanking(id, payload);
	if (!ranking) {
		return json({ message: "Ranking not found." }, { status: 404 });
	}

	const body: RankingMutationResponse = { ranking };
	return json(body);
};

const deleteAdminRanking: RequestHandler = async (event) => {
	requireAdminSession(event);

	const id = parseId(event.params.id ?? "");
	if (id === null) {
		return json({ message: "Invalid ranking id." }, { status: 400 });
	}

	const deleted = await deleteRanking(id);
	if (!deleted) {
		return json({ message: "Ranking not found." }, { status: 404 });
	}

	const body: RankingDeleteResponse = {
		deleted: true,
		id
	};

	return json(body);
};

export const PATCH = withApiHook(patchAdminRanking);
export const DELETE = withApiHook(deleteAdminRanking);
