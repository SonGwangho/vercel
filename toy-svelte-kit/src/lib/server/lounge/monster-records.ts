import { neon } from "@neondatabase/serverless";
import type { LoungeMonsterReward } from "../../types/LoungeMonster";

const schemas = new Map<string, Promise<void>>();

export async function recordMonsterRewards(databaseUrl: string, rewards: LoungeMonsterReward[]) {
  if (!rewards.length) return;
  const sql = neon(databaseUrl);
  if (!schemas.has(databaseUrl)) schemas.set(databaseUrl, (async () => {
    await sql`CREATE TABLE IF NOT EXISTS lounge_encyclopedias (token_hash text PRIMARY KEY, fish jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT NOW())`;
    await sql`ALTER TABLE lounge_encyclopedias ADD COLUMN IF NOT EXISTS insects jsonb NOT NULL DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS monsters jsonb NOT NULL DEFAULT '{}'::jsonb`;
  })().catch((error) => { schemas.delete(databaseUrl); throw error; }));
  await schemas.get(databaseUrl);
  const records = rewards.filter((reward) => reward.defeatedAt > Date.now() - 604800000);
  if (!records.length) return;
  await sql`WITH rewards AS (
    SELECT DISTINCT ON ("tokenHash", kind) "tokenHash", kind, "defeatedAt"
    FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb) AS r("tokenHash" text, kind text, "defeatedAt" bigint)
    ORDER BY "tokenHash", kind, "defeatedAt" DESC
  ), profiles AS (
    SELECT "tokenHash", jsonb_object_agg(kind, jsonb_build_object('defeatedAt', "defeatedAt")) AS monsters,
      MAX("defeatedAt") AS defeated_at FROM rewards GROUP BY "tokenHash"
  )
  INSERT INTO lounge_encyclopedias (token_hash, monsters, updated_at)
  SELECT "tokenHash", monsters, to_timestamp(defeated_at::double precision / 1000) FROM profiles
  ON CONFLICT (token_hash) DO UPDATE SET
    fish = CASE WHEN lounge_encyclopedias.updated_at <= NOW() - INTERVAL '7 days' THEN '{}'::jsonb ELSE lounge_encyclopedias.fish END,
    insects = CASE WHEN lounge_encyclopedias.updated_at <= NOW() - INTERVAL '7 days' THEN '{}'::jsonb ELSE lounge_encyclopedias.insects END,
    monsters = (SELECT jsonb_object_agg(species, record) FROM (
      SELECT DISTINCT ON (species) species, record FROM (
        SELECT key AS species, value AS record FROM jsonb_each(CASE WHEN lounge_encyclopedias.updated_at <= NOW() - INTERVAL '7 days' THEN '{}'::jsonb ELSE lounge_encyclopedias.monsters END)
        UNION ALL SELECT key, value FROM jsonb_each(EXCLUDED.monsters)
      ) entries ORDER BY species, (record->>'defeatedAt')::bigint DESC
    ) latest),
    updated_at = GREATEST(lounge_encyclopedias.updated_at, EXCLUDED.updated_at)`;
}
