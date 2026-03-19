import type { RequestEvent } from "@sveltejs/kit";

export function extractClientIp(
	event: Pick<RequestEvent, "request"> & Partial<Pick<RequestEvent, "getClientAddress">>
): string | null {
	const forwardedFor = event.request.headers.get("x-forwarded-for");
	const realIp = event.request.headers.get("x-real-ip");

	if (forwardedFor) {
		const [clientIp] = forwardedFor.split(",").map((value) => value.trim()).filter(Boolean);
		if (clientIp) {
			return clientIp;
		}
	}

	if (realIp) {
		return realIp.trim();
	}

	if (typeof event.getClientAddress === "function") {
		try {
			return event.getClientAddress();
		} catch {
			return null;
		}
	}

	return null;
}
