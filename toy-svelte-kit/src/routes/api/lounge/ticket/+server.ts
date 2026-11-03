import { json } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { createLoungeTicket } from "$lib/server/lounge/ticket";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
  const secret = env.LOUNGE_SOCKET_SECRET || env.DATABASE_URL;
  if (!secret) return json({ message: "실시간 서버 연결 설정이 없습니다." }, { status: 503 });
  return json({ ticket: createLoungeTicket(secret) }, { headers: { "cache-control": "no-store" } });
};
