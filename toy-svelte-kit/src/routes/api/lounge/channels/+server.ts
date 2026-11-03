import { listLoungeChannels } from "$lib/server/lounge";
import { loungeResponse } from "$lib/server/api/lounge";

export const GET = () => loungeResponse(async () => ({ channels: await listLoungeChannels() }));
