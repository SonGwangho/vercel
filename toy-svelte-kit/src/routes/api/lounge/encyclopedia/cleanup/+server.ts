import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { cleanupEncyclopedias } from "$lib/server/encyclopedia";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request }) => {
  if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return json({ message: "Unauthorized" }, { status: 401 });
  try {
    await cleanupEncyclopedias();
    return json({ deletedExpired: true });
  } catch (cause) {
    console.error("Encyclopedia cleanup failed", cause);
    return json({ message: "도감 정리를 완료하지 못했습니다." }, { status: 503 });
  }
};
