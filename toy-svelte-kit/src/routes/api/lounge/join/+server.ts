import { joinLounge } from "$lib/server/lounge";
import { loungeBody, loungeResponse } from "$lib/server/api/lounge";
import type { RequestHandler } from "./$types";
import type { LoungeJoinInput } from "$lib/types/Lounge";

export const POST: RequestHandler = ({ request }) => loungeResponse(async () => joinLounge(await loungeBody(request) as LoungeJoinInput));
