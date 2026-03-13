import { json } from "@sveltejs/kit";

import { getNeonSql } from "$lib/server/neon";
import type { NeonHealthResponse } from "$lib";

export async function handleNeonRequest(): Promise<Response> {
	try {
		const sql = getNeonSql();
		const result = (await sql`
			SELECT NOW()::text AS current_time, current_database() AS current_database
		`) as {
			current_time: string;
			current_database: string;
		}[];
		const row = result[0];
		const body: NeonHealthResponse = {
			ok: true,
			configured: true,
			message: "Neon connection is working.",
			database: row.current_database,
			currentTime: row.current_time
		};

		return json(body);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		const configured = !message.includes("DATABASE_URL is not configured.");
		const body: NeonHealthResponse = {
			ok: false,
			configured,
			message: configured ? "Neon connection failed." : "DATABASE_URL is missing.",
			error: message
		};

		return json(body, {
			status: configured ? 500 : 503
		});
	}
}
