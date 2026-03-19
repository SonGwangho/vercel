import { json, type RequestHandler } from "@sveltejs/kit";

import { requireAdminSession } from "$lib/server/adminAccess";
import { deleteIpBan } from "$lib/server/ipBans";
import type { IpBanDeleteResponse } from "$lib";
import { withApiHook } from "$lib/server/hooks/api";

function parseId(idText: string): number | null {
	const id = Number(idText);
	return Number.isInteger(id) && id > 0 ? id : null;
}

const deleteBan: RequestHandler = async (event) => {
	requireAdminSession(event);

	const id = parseId(event.params.id ?? "");
	if (id === null) {
		return json({ message: "Invalid ban id." }, { status: 400 });
	}

	const deleted = await deleteIpBan(id);
	if (!deleted) {
		return json({ message: "Ban not found." }, { status: 404 });
	}

	const body: IpBanDeleteResponse = {
		deleted: true,
		id
	};

	return json(body);
};

export const DELETE = withApiHook(deleteBan);
