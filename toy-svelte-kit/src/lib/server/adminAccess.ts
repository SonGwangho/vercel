import { dev } from "$app/environment";
import { error, type Cookies, type RequestEvent } from "@sveltejs/kit";

const ADMIN_ACCESS_TIMEZONE = "Asia/Seoul";
const ADMIN_GRACE_MINUTES = 1;
const ADMIN_SESSION_COOKIE = "admin_access";
const ADMIN_SESSION_VALUE = "ok";

function formatAdminPassword(date: Date): string {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: ADMIN_ACCESS_TIMEZONE,
		hour: "2-digit",
		minute: "2-digit",
		hour12: false
	}).formatToParts(date);
	const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
	const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

	return `admin${hour}${minute}`;
}

export function getAdminRoutePassword(date = new Date()): string {
	return formatAdminPassword(date);
}

export function isValidAdminPassword(password: string, now = new Date()): boolean {
	const normalized = password.trim();

	if (!normalized) {
		return false;
	}

	for (let offset = 0; offset <= ADMIN_GRACE_MINUTES; offset += 1) {
		const candidateDate = new Date(now.getTime() - offset * 60_000);

		if (normalized === formatAdminPassword(candidateDate)) {
			return true;
		}
	}

	return false;
}

export function requireAdminPasswordFromUrl(
	event: Pick<RequestEvent, "url">,
	queryKey = "password"
): string {
	const password = event.url.searchParams.get(queryKey)?.trim() ?? "";

	if (!isValidAdminPassword(password)) {
		throw error(401, "Admin authorization is required.");
	}

	return password;
}

export function setAdminSession(cookies: Cookies): void {
	cookies.set(ADMIN_SESSION_COOKIE, ADMIN_SESSION_VALUE, {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		secure: !dev,
		maxAge: 60 * 60 * 6
	});
}

export function requireAdminSession(event: Pick<RequestEvent, "cookies">): void {
	if (event.cookies.get(ADMIN_SESSION_COOKIE) !== ADMIN_SESSION_VALUE) {
		throw error(401, "Admin authorization is required.");
	}
}
