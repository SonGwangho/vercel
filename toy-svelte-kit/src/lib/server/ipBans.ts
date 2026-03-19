import { getNeonSql } from "$lib/server/neon";
import type { IpBanCreateRequest, IpBanRecord } from "$lib";

type IpBanRow = {
	id: number;
	ip_address: string;
	note: string;
	created_at: string;
	updated_at: string;
};

let ipBanTableReady: Promise<void> | null = null;
let ipBanCacheExpiresAt = 0;
let ipBanCache = new Set<string>();

const IP_BAN_CACHE_TTL_MS = 30_000;

function normalizeIpAddress(ipAddress: string): string {
	const normalized = ipAddress.trim().toLowerCase();

	if (!normalized) {
		throw new Error("ipAddress is required.");
	}

	if (normalized.length > 128) {
		throw new Error("ipAddress is too long.");
	}

	return normalized;
}

function normalizeNote(note: string | undefined): string {
	const normalized = note?.trim() ?? "";

	if (normalized.length > 500) {
		throw new Error("note must be 500 characters or fewer.");
	}

	return normalized;
}

function mapIpBanRow(row: IpBanRow): IpBanRecord {
	return {
		id: Number(row.id),
		ipAddress: row.ip_address,
		note: row.note,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

export async function ensureIpBanTable(): Promise<void> {
	if (!ipBanTableReady) {
		ipBanTableReady = (async () => {
			const sql = getNeonSql();
			await sql`
				CREATE TABLE IF NOT EXISTS ip_bans (
					id BIGSERIAL PRIMARY KEY,
					ip_address TEXT NOT NULL UNIQUE,
					note TEXT NOT NULL DEFAULT '',
					created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
					updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				)
			`;
			await sql`
				CREATE UNIQUE INDEX IF NOT EXISTS idx_ip_bans_ip_address
				ON ip_bans (ip_address)
			`;
		})().catch((error) => {
			ipBanTableReady = null;
			throw error;
		});
	}

	await ipBanTableReady;
}

export async function listIpBans(): Promise<IpBanRecord[]> {
	await ensureIpBanTable();

	const sql = getNeonSql();
	const rows = (await sql`
		SELECT id, ip_address, note, created_at::text, updated_at::text
		FROM ip_bans
		ORDER BY created_at DESC, id DESC
	`) as IpBanRow[];

	return rows.map(mapIpBanRow);
}

export async function isIpBanned(ipAddress: string | null): Promise<boolean> {
	if (!ipAddress) {
		return false;
	}

	await ensureIpBanTable();

	const normalizedIpAddress = normalizeIpAddress(ipAddress);
	const now = Date.now();

	if (ipBanCacheExpiresAt > now) {
		return ipBanCache.has(normalizedIpAddress);
	}

	const sql = getNeonSql();
	const rows = (await sql`
		SELECT ip_address
		FROM ip_bans
	`) as Array<{ ip_address: string }>;

	ipBanCache = new Set(rows.map((row) => row.ip_address));
	ipBanCacheExpiresAt = now + IP_BAN_CACHE_TTL_MS;

	return ipBanCache.has(normalizedIpAddress);
}

export async function createIpBan(input: IpBanCreateRequest): Promise<IpBanRecord> {
	await ensureIpBanTable();

	const sql = getNeonSql();
	const ipAddress = normalizeIpAddress(input.ipAddress);
	const note = normalizeNote(input.note);
	const rows = (await sql`
		INSERT INTO ip_bans (ip_address, note)
		VALUES (${ipAddress}, ${note})
		ON CONFLICT (ip_address)
		DO UPDATE SET
			note = EXCLUDED.note,
			updated_at = NOW()
		RETURNING id, ip_address, note, created_at::text, updated_at::text
	`) as IpBanRow[];

	ipBanCache.add(ipAddress);
	ipBanCacheExpiresAt = Date.now() + IP_BAN_CACHE_TTL_MS;

	return mapIpBanRow(rows[0]);
}

export async function deleteIpBan(id: number): Promise<boolean> {
	await ensureIpBanTable();

	const sql = getNeonSql();
	const rows = (await sql`
		DELETE FROM ip_bans
		WHERE id = ${id}
		RETURNING id, ip_address
	`) as Array<{ id: number; ip_address: string }>;

	if (rows[0]?.ip_address) {
		ipBanCache.delete(rows[0].ip_address);
		ipBanCacheExpiresAt = Date.now() + IP_BAN_CACHE_TTL_MS;
	}

	return rows.length > 0;
}
