import type { RequestHandler } from "./$types";

import { handleNeonRequest } from "$lib/server/api/neon";
import { withApiHook } from "$lib/server/hooks/api";

const getNeon: RequestHandler = async () => {
	return handleNeonRequest();
};

export const GET = withApiHook(getNeon);
