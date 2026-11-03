import { json } from "@sveltejs/kit";
import { LoungeError } from "$lib/server/lounge";

export async function loungeResponse(work: () => Promise<unknown>) {
  try { return json(await work(), { headers: { "cache-control": "no-store" } }); }
  catch (error) {
    if (error instanceof LoungeError) return json({ message: error.message }, { status: error.status });
    console.error("Lounge request failed", error);
    return json({ message: "라운지에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}

export async function loungeBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 4096) throw new LoungeError("요청 내용이 너무 큽니다.", 413);
  try { return JSON.parse(text); }
  catch { throw new LoungeError("올바르지 않은 요청입니다.", 400); }
}
