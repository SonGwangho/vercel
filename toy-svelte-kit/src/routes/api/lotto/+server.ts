import type { RequestHandler } from "./$types";

import { handleLottoRequest } from "$lib/server/api/lotto";
import { withApiHook } from "$lib/server/hooks/api";

const getLotto: RequestHandler = async ({ fetch }) => {
	return handleLottoRequest(fetch);
};

export const GET = withApiHook(getLotto);
