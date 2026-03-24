import type { PageServerLoad } from "./$types";

import type { CurrentWeather } from "$lib";
import { fetchCurrentWeather } from "$lib/server/weather";

export const load: PageServerLoad = async ({ fetch }) => {
	try {
		return {
			weather: await fetchCurrentWeather(fetch)
		};
	} catch {
		return {
			weather: null as CurrentWeather | null
		};
	}
};