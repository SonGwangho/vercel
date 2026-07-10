import type {
	RankingBoardListResponse,
	RankingCreateRequest,
	RankingListResponse,
	RankingListItem,
	RankingMutationResponse,
	RankingRecord
} from "../types/Ranking";

import { listRankedGames } from "../gameCodes";
import { Storage } from "../utils/Storage";
import { fetchJson } from "./api";

const LOCAL_RANKING_KEY = "rankings.local.records.v1";
const LOCAL_RANKING_LIMIT = 500;

function isLocalFallbackError(error: unknown): boolean {
	return (
		import.meta.env.DEV &&
		error instanceof Error &&
		error.message.includes("DATABASE_URL is not configured")
	);
}

function isRankingRecord(value: unknown): value is RankingRecord {
	if (!value || typeof value !== "object") {
		return false;
	}

	const record = value as Partial<RankingRecord>;
	return (
		typeof record.id === "number" &&
		typeof record.gameCode === "number" &&
		typeof record.gameName === "string" &&
		typeof record.userName === "string" &&
		typeof record.score === "number" &&
		typeof record.createdAt === "string" &&
		typeof record.updatedAt === "string"
	);
}

async function readLocalRecords(): Promise<RankingRecord[]> {
	const stored = (await Storage.get<unknown[]>(LOCAL_RANKING_KEY)) ?? [];
	return stored.filter(isRankingRecord);
}

function rankLocalRecords(records: RankingRecord[], gameCode: number, limit: number): RankingListItem[] {
	return records
		.filter((record) => record.gameCode === gameCode)
		.sort((left, right) => right.score - left.score || left.createdAt.localeCompare(right.createdAt))
		.slice(0, limit)
		.map((record, index) => ({ ...record, rank: index + 1 }));
}

async function loadLocalRankingBoards(limit: number): Promise<RankingBoardListResponse> {
	const records = await readLocalRecords();
	return {
		boards: listRankedGames().map((game) => ({
			game,
			rankings: rankLocalRecords(records, game.gameCode, limit)
		}))
	};
}

async function loadLocalRankings(gameCode: number, limit: number): Promise<RankingListResponse> {
	const records = await readLocalRecords();
	return { rankings: rankLocalRecords(records, gameCode, limit) };
}

async function createLocalRanking(input: RankingCreateRequest): Promise<RankingMutationResponse> {
	const records = await readLocalRecords();
	const now = new Date().toISOString();
	const ranking: RankingRecord = {
		id: Date.now(),
		gameCode: input.gameCode,
		gameName: input.gameName.trim(),
		userName: input.userName.trim(),
		score: Number(input.score),
		createdAt: now,
		updatedAt: now
	};

	await Storage.set(LOCAL_RANKING_KEY, [ranking, ...records].slice(0, LOCAL_RANKING_LIMIT));
	return { ranking };
}

export async function loadRankingBoards(limit: number): Promise<RankingBoardListResponse> {
	const searchParams = new URLSearchParams({
		limit: String(limit)
	});

	try {
		return await fetchJson<RankingBoardListResponse>(`/api/rankings/boards?${searchParams.toString()}`);
	} catch (error) {
		if (isLocalFallbackError(error)) {
			return loadLocalRankingBoards(limit);
		}

		throw error;
	}
}

export async function loadRankings(gameCode: number, limit: number): Promise<RankingListResponse> {
	const searchParams = new URLSearchParams({
		gameCode: String(gameCode),
		limit: String(limit)
	});

	try {
		return await fetchJson<RankingListResponse>(`/api/rankings?${searchParams.toString()}`);
	} catch (error) {
		if (isLocalFallbackError(error)) {
			return loadLocalRankings(gameCode, limit);
		}

		throw error;
	}
}

export async function createRanking(input: RankingCreateRequest): Promise<RankingMutationResponse> {
	try {
		return await fetchJson<RankingMutationResponse>("/api/rankings", {
			method: "POST",
			headers: {
				"content-type": "application/json"
			},
			body: JSON.stringify(input)
		});
	} catch (error) {
		if (isLocalFallbackError(error)) {
			return createLocalRanking(input);
		}

		throw error;
	}
}
