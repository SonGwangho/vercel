import { env } from "$env/dynamic/private";
import { neon } from "@neondatabase/serverless";

export function hasNeonDatabaseUrl() {
	return Boolean(env.DATABASE_URL);
}

export function getNeonSql() {
	const databaseUrl = env.DATABASE_URL;

	if (!databaseUrl) {
		throw new Error("DATABASE_URL is not configured.");
	}

	return neon(databaseUrl);
}
