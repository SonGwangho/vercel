import { createHash } from "node:crypto";
import { error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { getNeonSql } from "./neon";
import { verifyCatch } from "./lounge/catch-receipt";
import type { LoungeEncyclopediaInput, LoungeEncyclopediaProfile, LoungeEncyclopediaRow } from "$lib/types/LoungeEncyclopedia";

let ready: Promise<void> | null = null;
let lastCleanup = 0;

async function ensureTable() {
  ready ??= (async () => {
    const sql = getNeonSql();
    await sql`CREATE TABLE IF NOT EXISTS lounge_encyclopedias (
      token_hash text PRIMARY KEY, fish jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS lounge_encyclopedias_updated ON lounge_encyclopedias (updated_at)`;
    await sql`ALTER TABLE lounge_encyclopedias ADD COLUMN IF NOT EXISTS insects jsonb NOT NULL DEFAULT '{}'::jsonb`;
  })().catch((cause) => { ready = null; throw cause; });
  await ready;
}

function tokenHash(authorization: string | null) {
  const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) error(401, "도감 정보를 다시 불러와 주세요.");
  return createHash("sha256").update(token).digest("hex");
}

function profile(row?: LoungeEncyclopediaRow): LoungeEncyclopediaProfile {
  return { fish: row?.fish ?? {}, insects: row?.insects ?? {}, updatedAt: row ? new Date(row.updated_at).getTime() : null };
}

export async function cleanupEncyclopedias() {
  await ensureTable();
  await getNeonSql()`DELETE FROM lounge_encyclopedias WHERE updated_at <= NOW() - INTERVAL '7 days'`;
  lastCleanup = Date.now();
}

export async function readEncyclopedia(authorization: string | null) {
  const hash = tokenHash(authorization);
  await ensureTable();
  if (Date.now() - lastCleanup > 3600000) await cleanupEncyclopedias();
  const rows = await getNeonSql()`SELECT fish, insects, updated_at::text FROM lounge_encyclopedias
    WHERE token_hash = ${hash} AND updated_at > NOW() - INTERVAL '7 days'` as LoungeEncyclopediaRow[];
  return profile(rows[0]);
}

export async function recordEncyclopedia(authorization: string | null, input: unknown) {
  const hash = tokenHash(authorization);
  if (!input || typeof input !== "object") error(400, "올바르지 않은 도감 기록이에요.");
  const { receipt, sessionToken } = input as LoungeEncyclopediaInput;
  const claim = verifyCatch(receipt, sessionToken, env.LOUNGE_SOCKET_SECRET || env.DATABASE_URL || "");
  if (!claim) error(422, "포획 기록을 확인하지 못했어요.");
  await ensureTable();
  const record = JSON.stringify({ [claim.kind]: { sizeCm: claim.sizeCm, caughtAt: claim.caughtAt } });
  const category = claim.category ?? "fish";
  const rows = await getNeonSql()`INSERT INTO lounge_encyclopedias (token_hash, fish, insects, updated_at)
    VALUES (${hash}, ${category === "fish" ? record : "{}"}::jsonb, ${category === "insects" ? record : "{}"}::jsonb, to_timestamp(${claim.caughtAt}::double precision / 1000))
    ON CONFLICT (token_hash) DO UPDATE SET
      fish = CASE
        WHEN lounge_encyclopedias.updated_at <= NOW() - INTERVAL '7 days' THEN EXCLUDED.fish
        WHEN ${category}::text = 'fish' AND COALESCE((lounge_encyclopedias.fish -> ${claim.kind}::text ->> 'sizeCm')::int, 0) < ${claim.sizeCm}
          THEN lounge_encyclopedias.fish || EXCLUDED.fish
        ELSE lounge_encyclopedias.fish END,
      insects = CASE
        WHEN lounge_encyclopedias.updated_at <= NOW() - INTERVAL '7 days' THEN EXCLUDED.insects
        WHEN ${category}::text = 'insects' AND COALESCE((lounge_encyclopedias.insects -> ${claim.kind}::text ->> 'sizeCm')::int, 0) < ${claim.sizeCm}
          THEN lounge_encyclopedias.insects || EXCLUDED.insects
        ELSE lounge_encyclopedias.insects END,
      updated_at = GREATEST(lounge_encyclopedias.updated_at, EXCLUDED.updated_at)
    RETURNING fish, insects, updated_at::text` as LoungeEncyclopediaRow[];
  return profile(rows[0]);
}
