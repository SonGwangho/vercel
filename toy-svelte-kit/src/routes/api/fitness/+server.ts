import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import type { FitnessRecordSaveRequest } from "$lib";
import { listFitnessRecords, saveFitnessChange } from "$lib/server/fitness";
import { withApiHook } from "$lib/server/hooks/api";

function isSaveRequest(value: unknown): value is FitnessRecordSaveRequest {
	if (!value || typeof value !== "object" || !("action" in value) || !("date" in value)) return false;
	if (typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
	const date = new Date(value.date + "T00:00:00Z");
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.date) return false;

	if (value.action === "availability") {
		return "isAvailable" in value && typeof value.isAvailable === "boolean" &&
			"isUnavailable" in value && typeof value.isUnavailable === "boolean" &&
			!(value.isAvailable && value.isUnavailable);
	}
	if ((value.action !== "addMemo" && value.action !== "editMemo") || !("memo" in value)) return false;
	const memo = value.memo;
	if (!memo || typeof memo !== "object") return false;
	return "id" in memo && typeof memo.id === "string" &&
		/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(memo.id) &&
		"author" in memo && typeof memo.author === "string" &&
		"body" in memo && typeof memo.body === "string" && memo.body.trim().length > 0 &&
		"revision" in memo && typeof memo.revision === "number" && Number.isSafeInteger(memo.revision) &&
		(value.action === "addMemo" ? memo.revision === 0 : memo.revision > 0);
}

const getFitnessRecords: RequestHandler = async () => json({ records: await listFitnessRecords() });

const saveFitnessRecord: RequestHandler = async ({ request }) => {
	const payload: unknown = await request.json().catch(() => null);
	if (!isSaveRequest(payload)) {
		return json({ message: "저장 형식을 확인해 주세요. 이전 버전에서는 페이지를 새로고침해 주세요." }, { status: 400 });
	}
	return json({ records: await saveFitnessChange(payload) });
};

export const GET = withApiHook(getFitnessRecords);
export const POST = withApiHook(saveFitnessRecord);
