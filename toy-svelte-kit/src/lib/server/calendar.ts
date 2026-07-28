import { getNeonSql } from "$lib/server/neon";
import type { CalendarMarkColor, PersonalDayOffItem } from "$lib";

type PersonalDayOffRow = {
	date: string;
	name: string;
	color: string;
};

const CALENDAR_MARK_COLORS: CalendarMarkColor[] = [
	"default",
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"indigo",
	"purple"
];

let calendarTableReady: Promise<void> | null = null;

export function isCalendarMarkColor(value: unknown): value is CalendarMarkColor {
	return typeof value === "string" && CALENDAR_MARK_COLORS.includes(value as CalendarMarkColor);
}

export function isCalendarDateKey(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const date = new Date(`${value}T00:00:00Z`);
	return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizePersonalDayOffItem(item: PersonalDayOffItem): PersonalDayOffItem {
	const name = item.name.trim();

	if (!isCalendarDateKey(item.date) || !name || name.length > 20 || !isCalendarMarkColor(item.color)) {
		throw new Error("Invalid calendar item.");
	}

	return {
		date: item.date,
		name,
		color: item.color
	};
}

function mapPersonalDayOffRow(row: PersonalDayOffRow): PersonalDayOffItem {
	if (!isCalendarMarkColor(row.color)) {
		throw new Error("Invalid calendar color stored in database.");
	}

	return {
		date: row.date,
		name: row.name,
		color: row.color
	};
}

export async function ensureCalendarTable(): Promise<void> {
	if (!calendarTableReady) {
		calendarTableReady = (async () => {
			const sql = getNeonSql();

			await sql`
				CREATE TABLE IF NOT EXISTS calendar_personal_day_offs (
					date DATE PRIMARY KEY,
					name VARCHAR(20) NOT NULL,
					color TEXT NOT NULL,
					created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
					updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				)
			`;
		})().catch((error) => {
			calendarTableReady = null;
			throw error;
		});
	}

	await calendarTableReady;
}

export async function listPersonalDayOffItems(): Promise<PersonalDayOffItem[]> {
	await ensureCalendarTable();

	const sql = getNeonSql();
	const rows = (await sql`
		SELECT date::text, name, color
		FROM calendar_personal_day_offs
		ORDER BY date ASC
	`) as PersonalDayOffRow[];

	return rows.map(mapPersonalDayOffRow);
}

export async function upsertPersonalDayOffItem(
	item: PersonalDayOffItem
): Promise<PersonalDayOffItem[]> {
	await ensureCalendarTable();

	const nextItem = normalizePersonalDayOffItem(item);
	const sql = getNeonSql();

	await sql`
		INSERT INTO calendar_personal_day_offs (date, name, color)
		VALUES (${nextItem.date}, ${nextItem.name}, ${nextItem.color})
		ON CONFLICT (date) DO UPDATE
		SET
			name = EXCLUDED.name,
			color = EXCLUDED.color,
			updated_at = NOW()
	`;

	return listPersonalDayOffItems();
}

export async function deletePersonalDayOffItem(date: string): Promise<PersonalDayOffItem[]> {
	if (!isCalendarDateKey(date)) {
		throw new Error("Invalid calendar date.");
	}

	await ensureCalendarTable();

	const sql = getNeonSql();
	await sql`
		DELETE FROM calendar_personal_day_offs
		WHERE date = ${date}
	`;

	return listPersonalDayOffItems();
}
