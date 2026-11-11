import { error } from "@sveltejs/kit";
import type { FitnessRecord, FitnessRecordSaveRequest } from "$lib";
import { getNeonSql } from "$lib/server/neon";

const legacyMemoId = "00000000-0000-0000-0000-000000000000";
let fitnessTableReady: Promise<void> | null = null;

async function prepareTables() {
	const sql = getNeonSql();
	await sql.transaction([
		sql`SELECT pg_advisory_xact_lock(hashtext('fitness_memos_schema'))`,
		sql`
			CREATE TABLE IF NOT EXISTS fitness_records (
				date DATE PRIMARY KEY,
				is_unavailable BOOLEAN NOT NULL DEFAULT FALSE,
				is_available BOOLEAN NOT NULL DEFAULT FALSE,
				memo TEXT NOT NULL DEFAULT '',
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			)
		`,
		sql`
			ALTER TABLE fitness_records
				ADD COLUMN IF NOT EXISTS is_unavailable BOOLEAN NOT NULL DEFAULT FALSE,
				ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT FALSE
		`,
		sql`
			CREATE TABLE IF NOT EXISTS fitness_memos (
				date DATE NOT NULL REFERENCES fitness_records(date) ON DELETE CASCADE,
				id UUID NOT NULL,
				entry_order BIGINT GENERATED ALWAYS AS IDENTITY,
				author TEXT NOT NULL DEFAULT '',
				body TEXT NOT NULL,
				revision INTEGER NOT NULL DEFAULT 1,
				PRIMARY KEY (date, id)
			)
		`,
		// One legacy entry per date. Keep the original text, including its line breaks.
		sql`
			INSERT INTO fitness_memos (date, id, body)
			SELECT r.date, ${legacyMemoId}::uuid, r.memo
			FROM fitness_records r
			WHERE r.memo <> '' AND NOT EXISTS (
				SELECT 1 FROM fitness_memos m WHERE m.date = r.date AND m.id = ${legacyMemoId}::uuid
			)
			ON CONFLICT (date, id) DO NOTHING
		`
	]);
}

function ensureFitnessTable() {
	return fitnessTableReady ??= prepareTables().catch((cause) => {
		fitnessTableReady = null;
		throw cause;
	});
}

export async function listFitnessRecords(): Promise<FitnessRecord[]> {
	await ensureFitnessTable();
	const sql = getNeonSql();
	const rows = await sql`
		SELECT r.date::text AS date, r.is_available AS "isAvailable", r.is_unavailable AS "isUnavailable",
			COALESCE(jsonb_agg(jsonb_build_object(
				'id', m.id, 'author', m.author, 'body', m.body, 'revision', m.revision
			) ORDER BY m.entry_order) FILTER (WHERE m.id IS NOT NULL), '[]'::jsonb) AS memos
		FROM fitness_records r LEFT JOIN fitness_memos m ON m.date = r.date
		GROUP BY r.date
		ORDER BY r.date
	` as Omit<FitnessRecord, "memo">[];
	return rows.map((record) => ({
		...record,
		memo: record.memos.map((entry) => entry.body).join("\n")
	}));
}

export async function saveFitnessChange(change: FitnessRecordSaveRequest) {
	await ensureFitnessTable();
	const sql = getNeonSql();
	if (change.action === "availability") {
		await sql`
			INSERT INTO fitness_records (date, is_available, is_unavailable)
			VALUES (${change.date}, ${change.isAvailable}, ${change.isUnavailable})
			ON CONFLICT (date) DO UPDATE SET is_available = EXCLUDED.is_available,
				is_unavailable = EXCLUDED.is_unavailable, updated_at = NOW()
		`;
	} else if (change.action === "deleteMemo") {
		const { id, revision } = change.memo;
		// Clear the legacy source atomically so a later cold start cannot restore this memo.
		const deleted = await sql`
			WITH deleted AS (
				DELETE FROM fitness_memos
				WHERE date = ${change.date} AND id = ${id} AND revision = ${revision}
				RETURNING date, id
			), cleared_legacy AS (
				UPDATE fitness_records r SET memo = '', updated_at = NOW()
				FROM deleted d
				WHERE r.date = d.date AND d.id = ${legacyMemoId}::uuid
				RETURNING r.date
			)
			SELECT d.id FROM deleted d LEFT JOIN cleared_legacy c ON c.date = d.date
		`;
		if (!deleted.length) {
			const existing = await sql`
				SELECT id FROM fitness_memos WHERE date = ${change.date} AND id = ${id}
			`;
			if (existing.length) error(409, "메모가 변경되었습니다. 목록에서 다시 열어 주세요.");
		}
	} else {
		const { id, author, body, revision } = change.memo;
		if (change.action === "addMemo") {
			const [, inserted] = await sql.transaction([
				sql`INSERT INTO fitness_records (date) VALUES (${change.date}) ON CONFLICT (date) DO NOTHING`,
				sql`
					INSERT INTO fitness_memos (date, id, author, body)
					VALUES (${change.date}, ${id}, ${author.trim()}, ${body})
					ON CONFLICT (date, id) DO UPDATE SET id = EXCLUDED.id
					WHERE fitness_memos.author = EXCLUDED.author AND fitness_memos.body = EXCLUDED.body
					RETURNING id
				`
			]);
			if (!inserted.length) error(409, "이미 저장된 메모입니다. 목록에서 다시 열어 주세요.");
		} else {
			const updated = await sql`
				UPDATE fitness_memos SET author = ${author.trim()}, body = ${body},
					revision = CASE WHEN revision = ${revision} THEN revision + 1 ELSE revision END
				WHERE date = ${change.date} AND id = ${id}
					AND (revision = ${revision} OR (author = ${author.trim()} AND body = ${body}))
				RETURNING id
			`;
			if (!updated.length) error(409, "메모가 변경되었습니다. 목록에서 다시 열어 주세요.");
		}
	}
	return listFitnessRecords();
}
