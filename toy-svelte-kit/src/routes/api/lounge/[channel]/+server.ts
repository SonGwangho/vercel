import { commandLounge, readLounge, sessionFromRequest } from "$lib/server/lounge";
import { loungeBody, loungeResponse } from "$lib/server/api/lounge";
import type { RequestHandler } from "./$types";
import type { LoungeCommand } from "$lib/types/Lounge";

export const GET: RequestHandler = ({ request, params }) => loungeResponse(() => readLounge(sessionFromRequest(request, params.channel)));
export const POST: RequestHandler = ({ request, params }) => loungeResponse(async () => commandLounge(sessionFromRequest(request, params.channel), await loungeBody(request) as LoungeCommand));
