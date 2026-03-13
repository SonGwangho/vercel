import { getNeonSql } from "$lib/server/neon";
import type {
	RankingCreateRequest,
	RankingListItem,
	RankingRecord,
	RankingUpdateRequest
} from "$lib/types/Ranking";

type RankingRow = {
	id: number;
	game_code: number;
	game_name: string;
	user_name: string;
	score: number;
	ip_address: string | null;
	created_at: string;
	updated_at: string;
};

let rankingTableReady: Promise<void> | null = null;

function normalizeScore(score: unknown): number {
	const value = typeof score === "number" ? score : Number(score);

	if (!Number.isFinite(value)) {
		throw new Error("score must be a finite number.");
	}

	return value;
}

function mapRankingRow(row: RankingRow): RankingRecord {
	return {
		id: Number(row.id),
		gameCode: Number(row.game_code),
		gameName: row.game_name,
		userName: row.user_name,
		score: Number(row.score),
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export async function ensureRankingTable(): Promise<void> {
	if (!rankingTableReady) {
		rankingTableReady = (async () => {
			const sql = getNeonSql();
			await sql`
				CREATE TABLE IF NOT EXISTS game_rankings (
					id BIGSERIAL PRIMARY KEY,
					game_code INTEGER NOT NULL,
					game_name TEXT NOT NULL,
					user_name TEXT NOT NULL,
					score DOUBLE PRECISION NOT NULL,
					ip_address TEXT,
					created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
					updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				)
			`;
			await sql`
				ALTER TABLE game_rankings
				ADD COLUMN IF NOT EXISTS ip_address TEXT
			`;
			await sql`
				CREATE INDEX IF NOT EXISTS idx_game_rankings_game_score
				ON game_rankings (game_code, score DESC, created_at ASC)
			`;
		})().catch((error) => {
			rankingTableReady = null;
			throw error;
		});
	}

	await rankingTableReady;
}

export async function listRankings(gameCode: number, limit = 10): Promise<RankingListItem[]> {
	await ensureRankingTable();

	const sql = getNeonSql();
	const rows = (await sql`
		SELECT id, game_code, game_name, user_name, score, ip_address, created_at::text, updated_at::text
		FROM game_rankings
		WHERE game_code = ${gameCode}
		ORDER BY score DESC, created_at ASC
		LIMIT ${limit}
	`) as RankingRow[];

	return rows.map((row, index) => ({
		...mapRankingRow(row),
		rank: index + 1
	}));
}

export async function getRankingById(id: number): Promise<RankingRecord | null> {
	await ensureRankingTable();

	const sql = getNeonSql();
	const rows = (await sql`
		SELECT id, game_code, game_name, user_name, score, ip_address, created_at::text, updated_at::text
		FROM game_rankings
		WHERE id = ${id}
		LIMIT 1
	`) as RankingRow[];

	return rows[0] ? mapRankingRow(rows[0]) : null;
}

export async function createRanking(input: RankingCreateRequest, ipAddress: string | null): Promise<RankingRecord> {
	await ensureRankingTable();

	const gameCode = Number(input.gameCode);
	const gameName = input.gameName.trim();
	const userName = input.userName.trim();
	const score = normalizeScore(input.score);

	if (!Number.isInteger(gameCode)) {
		throw new Error("gameCode must be an integer.");
	}

	if (!gameName) {
		throw new Error("gameName is required.");
	}

	if (!userName) {
		throw new Error("userName is required.");
	}

	const sql = getNeonSql();
	const rows = (await sql`
		INSERT INTO game_rankings (game_code, game_name, user_name, score, ip_address)
		VALUES (${gameCode}, ${gameName}, ${userName}, ${score}, ${ipAddress})
		RETURNING id, game_code, game_name, user_name, score, ip_address, created_at::text, updated_at::text
	`) as RankingRow[];

	return mapRankingRow(rows[0]);
}

export async function updateRanking(
	id: number,
	input: RankingUpdateRequest
): Promise<RankingRecord | null> {
	const current = await getRankingById(id);

	if (!current) {
		return null;
	}

	const nextGameName =
		typeof input.gameName === "string" && input.gameName.trim() ? input.gameName.trim() : current.gameName;
	const nextUserName =
		typeof input.userName === "string" && input.userName.trim() ? input.userName.trim() : current.userName;
	const nextScore = input.score === undefined ? current.score : normalizeScore(input.score);

	const sql = getNeonSql();
	const rows = (await sql`
		UPDATE game_rankings
		SET
			game_name = ${nextGameName},
			user_name = ${nextUserName},
			score = ${nextScore},
			updated_at = NOW()
		WHERE id = ${id}
		RETURNING id, game_code, game_name, user_name, score, ip_address, created_at::text, updated_at::text
	`) as RankingRow[];

	return rows[0] ? mapRankingRow(rows[0]) : null;
}

export async function deleteRanking(id: number): Promise<boolean> {
	await ensureRankingTable();

	const sql = getNeonSql();
	const rows = (await sql`
		DELETE FROM game_rankings
		WHERE id = ${id}
		RETURNING id
	`) as Array<{ id: number }>;

	return rows.length > 0;
}
