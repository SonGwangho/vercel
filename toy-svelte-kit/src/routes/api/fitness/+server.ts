import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import fitnessSource from "$lib/assets/data/fitness.json";
import { listFitnessRecords, normalizeFitnessRecords, seedFitnessRecords, upsertFitnessRecord } from "$lib/server/fitness";
import { withApiHook } from "$lib/server/hooks/api";
import type { FitnessCalendarData, FitnessRecord, FitnessRecordSaveRequest } from "$lib";

const FITNESS_PASSWORD = "4321";
const fitnessData = fitnessSource as FitnessCalendarData;

function isFitnessRecord(value: unknown): value is FitnessRecord {
	return Boolean(
		value &&
			typeof value === "object" &&
			"date" in value &&
			"hasPt" in value &&
			"memo" in value &&
			typeof value.date === "string" &&
			typeof value.hasPt === "boolean" &&
			typeof value.memo === "string"
	);
}

function isSaveRequest(value: unknown): value is FitnessRecordSaveRequest {
	return Boolean(
		value &&
			typeof value === "object" &&
			"password" in value &&
			"record" in value &&
			typeof value.password === "string" &&
			isFitnessRecord(value.record)
	);
}

function readSeedRecords() {
	return normalizeFitnessRecords(Array.isArray(fitnessData.records) ? fitnessData.records : []);
}

async function ensureSeededFitnessRecords() {
	await seedFitnessRecords(readSeedRecords());
}

const getFitnessRecords: RequestHandler = async () => {
	await ensureSeededFitnessRecords();
	return json({ records: await listFitnessRecords() });
};

const saveFitnessRecord: RequestHandler = async ({ request }) => {
	let payload: unknown;

	try {
		payload = await request.json();
	} catch {
		return json({ message: "Invalid JSON body." }, { status: 400 });
	}

	if (!isSaveRequest(payload)) {
		return json({ message: "Invalid fitness record." }, { status: 400 });
	}

	if (payload.password !== FITNESS_PASSWORD) {
		return json({ message: "Password is incorrect." }, { status: 401 });
	}

	await ensureSeededFitnessRecords();
	return json({ records: await upsertFitnessRecord(payload.record) });
};

export const GET = withApiHook(getFitnessRecords);
export const POST = withApiHook(saveFitnessRecord);
