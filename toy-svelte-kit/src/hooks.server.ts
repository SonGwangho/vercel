import { sequence } from "@sveltejs/kit/hooks";

import { isIpBanned } from "$lib/server/ipBans";
import { extractClientIp } from "$lib/server/requestIp";
import { apiHandle } from "$lib/server/hooks/api";

const ipBanHandle = (async ({ event, resolve }) => {
	const clientIp = extractClientIp(event);

	if (await isIpBanned(clientIp)) {
		if (event.url.pathname.startsWith("/api/")) {
			return new Response(JSON.stringify({ message: "Access denied." }), {
				status: 403,
				headers: {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-store"
				}
			});
		}

		return new Response(
			`<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Access denied</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111827;color:#f9fafb;font-family:system-ui,sans-serif;padding:24px}.card{max-width:560px;padding:32px;border-radius:24px;background:#1f2937;border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 40px rgba(0,0,0,.28)}h1{margin:0 0 12px;font-size:40px;line-height:1.05}p{margin:0;color:#d1d5db;line-height:1.7}</style></head><body><section class="card"><h1>접근이 차단되었습니다.</h1><p>이 IP는 관리자에 의해 사이트 접근이 차단되었습니다.</p></section></body></html>`,
			{
				status: 403,
				headers: {
					"content-type": "text/html; charset=utf-8",
					"cache-control": "no-store"
				}
			}
		);
	}

	return resolve(event);
}) satisfies import("@sveltejs/kit").Handle;

export const handle = sequence(ipBanHandle, apiHandle);
