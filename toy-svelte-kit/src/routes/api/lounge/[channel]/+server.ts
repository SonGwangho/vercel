import { commandLounge, readLounge, sessionFromRequest, waitForLoungeChange } from "$lib/server/lounge";
import { loungeBody, loungeResponse } from "$lib/server/api/lounge";
import type { RequestHandler } from "./$types";
import type { LoungeCommand } from "$lib/types/Lounge";

export const GET: RequestHandler = ({ request, params, url }) => loungeResponse(async () => {
  const receivedAt = Date.now();
  const session = sessionFromRequest(request, params.channel);
  let state = await readLounge(session);
  const since = url.searchParams.get("since");
  if (url.searchParams.get("wait") === "1" && since !== null && Number(since) === state.revision) state = await waitForLoungeChange(session, state, request.signal);
  const serverNow = Date.now();
  const processingMs = serverNow - receivedAt;
  return since !== null && Number(since) === state.revision ? { unchanged: true, revision: state.revision, serverNow, processingMs } : { ...state, serverNow, processingMs };
});
export const POST: RequestHandler = ({ request, params }) => loungeResponse(async () => {
  const receivedAt = Date.now();
  const state = await commandLounge(sessionFromRequest(request, params.channel), await loungeBody(request) as LoungeCommand);
  const serverNow = Date.now();
  return { ...state, serverNow, processingMs: serverNow - receivedAt };
});
