import type { RequestHandler } from "./$types";

import { handleCurrentWeatherRequest } from "$lib/server/api/weather";
import { withApiHook } from "$lib/server/hooks/api";

const getCurrentWeather: RequestHandler = async ({ fetch }) => {
	return handleCurrentWeatherRequest(fetch);
};

export const GET = withApiHook(getCurrentWeather);