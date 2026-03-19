import { listRankedGames } from "$lib/gameCodes";
import { isValidAdminPassword, setAdminSession } from "$lib/server/adminAccess";
import { error } from "@sveltejs/kit";

export const load = ({
	params,
	cookies
}: {
	params: { password: string };
	cookies: import("@sveltejs/kit").Cookies;
}) => {
	if (!isValidAdminPassword(params.password)) {
		throw error(404, "Not found");
	}

	setAdminSession(cookies);

	return {
		games: listRankedGames(),
		adminBasePath: `/admin/${params.password}`
	};
};
