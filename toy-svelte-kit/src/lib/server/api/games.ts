import { json } from "@sveltejs/kit";

import { listGameCodes } from "$lib/gameCodes";
import type { GameCodeListResponse } from "$lib";

export async function handleGameCodesRequest(): Promise<Response> {
	const body: GameCodeListResponse = {
		games: listGameCodes()
	};

	return json(body);
}
