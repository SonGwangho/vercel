import type { RequestHandler } from "./$types";

import { handleGameCodesRequest } from "$lib/server/api/games";
import { withApiHook } from "$lib/server/hooks/api";

const getGameCodes: RequestHandler = async () => {
	return handleGameCodesRequest();
};

export const GET = withApiHook(getGameCodes);
