import { json } from "@sveltejs/kit";

import { fetchCurrentWeather } from "$lib/server/weather";
import type { CurrentWeatherResponse } from "$lib";

export async function handleCurrentWeatherRequest(fetcher: typeof fetch): Promise<Response> {
	try {
		const weather = await fetchCurrentWeather(fetcher);

		if (!weather) {
			return json({ message: "Current weather is empty." }, { status: 502 });
		}

		const body: CurrentWeatherResponse = { weather };
		return json(body, {
			headers: {
				"cache-control": "no-store"
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to load current weather.";
		return json({ message }, { status: 502 });
	}
}