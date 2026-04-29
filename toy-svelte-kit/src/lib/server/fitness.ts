import { getNeonSql } from "$lib/server/neon";
import type { FitnessRecord } from "$lib";

type FitnessRecordRow = {
	date: string;
	has_pt: boolean;
	memo: string;
};

let fitnessTableReady: Promise<void> | null = null;

function mapFitnessRecordRow(row: FitnessRecordRow): FitnessRecord {
	return {
		date: row.date,
		hasPt: row.has_pt,
		memo: row.memo
	};
}

export function normalizeFitnessRecords(records: FitnessRecord[]) {
	return records
		.filter((record) => record.date && typeof record.hasPt === "boolean" && typeof record.memo === "string")
		.map((record) => ({
			date: record.date,
			hasPt: record.hasPt,
			memo: record.memo.trim()
		}))
		.sort((left, right) => left.date.localeCompare(right.date));
}

export async function ensureFitnessTable(): Promise<void> {
	if (!fitnessTableReady) {
		fitnessTableReady = (async () => {
			const sql = getNeonSql();

			await sql`
				CREATE TABLE IF NOT EXISTS fitness_records (
					date DATE PRIMARY KEY,
					has_pt BOOLEAN NOT NULL DEFAULT FALSE,
					memo TEXT NOT NULL DEFAULT '',
					created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
					updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				)
			`;
		})().catch((error) => {
			fitnessTableReady = null;
			throw error;
		});
	}

	await fitnessTableReady;
}

export async function seedFitnessRecords(records: FitnessRecord[]) {
	const sourceRecords = normalizeFitnessRecords(records);

	if (sourceRecords.length === 0) {
		return;
	}

	await ensureFitnessTable();

	const sql = getNeonSql();
	for (const record of sourceRecords) {
		await sql`
			INSERT INTO fitness_records (date, has_pt, memo)
			VALUES (${record.date}, ${record.hasPt}, ${record.memo})
			ON CONFLICT (date) DO NOTHING
		`;
	}
}

export async function listFitnessRecords(): Promise<FitnessRecord[]> {
	await ensureFitnessTable();

	const sql = getNeonSql();
	const rows = (await sql`
		SELECT date::text, has_pt, memo
		FROM fitness_records
		ORDER BY date ASC
	`) as FitnessRecordRow[];

	return rows.map(mapFitnessRecordRow);
}

export async function upsertFitnessRecord(record: FitnessRecord): Promise<FitnessRecord[]> {
	await ensureFitnessTable();

	const nextRecord = normalizeFitnessRecords([record])[0];
	if (!nextRecord) {
		throw new Error("Invalid fitness record.");
	}

	const sql = getNeonSql();
	await sql`
		INSERT INTO fitness_records (date, has_pt, memo)
		VALUES (${nextRecord.date}, ${nextRecord.hasPt}, ${nextRecord.memo})
		ON CONFLICT (date) DO UPDATE
		SET
			has_pt = EXCLUDED.has_pt,
			memo = EXCLUDED.memo,
			updated_at = NOW()
	`;

	return listFitnessRecords();
}
