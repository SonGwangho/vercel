import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import type { PersonalDayOffItem } from "$lib";
import {
	deletePersonalDayOffItem,
	isCalendarDateKey,
	isCalendarMarkColor,
	listPersonalDayOffItems,
	upsertPersonalDayOffItem
} from "$lib/server/calendar";
import { withApiHook } from "$lib/server/hooks/api";

function isPersonalDayOffItem(value: unknown): value is PersonalDayOffItem {
	return Boolean(
		value &&
			typeof value === "object" &&
			"date" in value &&
			"name" in value &&
			"color" in value &&
			isCalendarDateKey(value.date) &&
			typeof value.name === "string" &&
			Boolean(value.name.trim()) &&
			value.name.trim().length <= 20 &&
			isCalendarMarkColor(value.color)
	);
}

const getCalendarItems: RequestHandler = async () => {
	return json({ items: await listPersonalDayOffItems() });
};

const saveCalendarItem: RequestHandler = async ({ request }) => {
	let payload: unknown;

	try {
		payload = await request.json();
	} catch {
		return json({ message: "Invalid JSON body." }, { status: 400 });
	}

	if (!isPersonalDayOffItem(payload)) {
		return json({ message: "Invalid calendar item." }, { status: 400 });
	}

	return json({ items: await upsertPersonalDayOffItem(payload) });
};

const deleteCalendarItem: RequestHandler = async ({ url }) => {
	const date = url.searchParams.get("date");

	if (!isCalendarDateKey(date)) {
		return json({ message: "Invalid calendar date." }, { status: 400 });
	}

	return json({ items: await deletePersonalDayOffItem(date) });
};

export const GET = withApiHook(getCalendarItems);
export const POST = withApiHook(saveCalendarItem);
export const DELETE = withApiHook(deleteCalendarItem);
