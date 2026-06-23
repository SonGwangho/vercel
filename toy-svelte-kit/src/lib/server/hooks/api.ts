import { isHttpError, json, type Handle } from "@sveltejs/kit";

function errorResponse(error: unknown): Response {
	if (isHttpError(error)) {
		return json({ message: error.body.message }, { status: error.status });
	}

	const message = error instanceof Error ? error.message : "Internal server error.";
	return json({ message }, { status: 500 });
}

export const apiHandle: Handle = async ({ event, resolve }) => {
	try {
		const response = await resolve(event);

		if (event.url.pathname.startsWith("/api/")) {
			response.headers.set("cache-control", "no-store");
			response.headers.set("x-content-type-options", "nosniff");
		}

		return response;
	} catch (error) {
		if (!event.url.pathname.startsWith("/api/")) {
			throw error;
		}

		return errorResponse(error);
	}
};

export function withApiHook<T extends (event: Parameters<T>[0]) => Response | Promise<Response>>(
	handler: T
): T {
	return (async (event: Parameters<T>[0]) => {
		try {
			return await handler(event);
		} catch (error) {
			return errorResponse(error);
		}
	}) as T;
}
