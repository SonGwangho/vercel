import { error, isHttpError, json } from "@sveltejs/kit";
import { readEncyclopedia, recordEncyclopedia } from "$lib/server/encyclopedia";
import type { RequestHandler } from "./$types";

async function respond(work: () => Promise<unknown>) {
  try { return json(await work(), { headers: { "cache-control": "no-store" } }); }
  catch (cause) {
    if (isHttpError(cause)) return json({ message: cause.body.message }, { status: cause.status });
    console.error("Encyclopedia persistence failed", cause);
    return json({ message: "도감을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}

export const GET: RequestHandler = ({ request }) => respond(() => readEncyclopedia(request.headers.get("authorization")));
export const POST: RequestHandler = ({ request }) => respond(async () => {
  const text = await request.text();
  if (text.length > 4096) error(413, "요청 내용이 너무 큽니다.");
  let input: unknown;
  try { input = JSON.parse(text); } catch { error(400, "올바르지 않은 요청입니다."); }
  return recordEncyclopedia(request.headers.get("authorization"), input);
});
