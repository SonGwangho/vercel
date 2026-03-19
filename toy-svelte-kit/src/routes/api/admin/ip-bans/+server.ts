import { json, type RequestHandler } from "@sveltejs/kit";

import { requireAdminSession } from "$lib/server/adminAccess";
import { createIpBan, listIpBans } from "$lib/server/ipBans";
import type { IpBanCreateRequest, IpBanListResponse, IpBanMutationResponse } from "$lib";
import { withApiHook } from "$lib/server/hooks/api";

const getIpBans: RequestHandler = async (event) => {
	requireAdminSession(event);

	const bans = await listIpBans();
	const body: IpBanListResponse = { bans };
	return json(body);
};

const createBan: RequestHandler = async (event) => {
	requireAdminSession(event);

	let payload: IpBanCreateRequest;
	try {
		payload = (await event.request.json()) as IpBanCreateRequest;
	} catch {
		return json({ message: "Invalid JSON body." }, { status: 400 });
	}

	const ban = await createIpBan(payload);
	const body: IpBanMutationResponse = { ban };
	return json(body, { status: 201 });
};

export const GET = withApiHook(getIpBans);
export const POST = withApiHook(createBan);
