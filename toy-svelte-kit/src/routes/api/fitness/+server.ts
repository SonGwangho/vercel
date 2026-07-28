import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { listFitnessRecords, upsertFitnessRecord } from "$lib/server/fitness";
import { withApiHook } from "$lib/server/hooks/api";
import type { FitnessRecord, FitnessRecordSaveRequest } from "$lib";

function isFitnessRecord(value: unknown): value is FitnessRecord {
	return Boolean(
		value &&
			typeof value === "object" &&
			"date" in value &&
			"isUnavailable" in value &&
			"isAvailable" in value &&
			"memo" in value &&
			typeof value.date === "string" &&
			typeof value.isUnavailable === "boolean" &&
			typeof value.isAvailable === "boolean" &&
			typeof value.memo === "string" &&
			!(value.isUnavailable && value.isAvailable)
	);
}

function isSaveRequest(value: unknown): value is FitnessRecordSaveRequest {
	return Boolean(
		value &&
			typeof value === "object" &&
			"record" in value &&
			isFitnessRecord(value.record)
	);
}

const getFitnessRecords: RequestHandler = async () => {
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

	return json({ records: await upsertFitnessRecord(payload.record) });
};

export const GET = withApiHook(getFitnessRecords);
export const POST = withApiHook(saveFitnessRecord);
