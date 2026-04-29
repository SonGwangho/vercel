import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { withApiHook } from "$lib/server/hooks/api";
import type { FitnessCalendarData, FitnessRecord, FitnessRecordSaveRequest } from "$lib";

const FITNESS_PASSWORD = "4321";
const FITNESS_DATA_PATH = path.resolve(process.cwd(), "src/lib/assets/data/fitness.json");

function isFitnessRecord(value: unknown): value is FitnessRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      "date" in value &&
      "hasPt" in value &&
      "memo" in value &&
      typeof value.date === "string" &&
      typeof value.hasPt === "boolean" &&
      typeof value.memo === "string",
  );
}

function isSaveRequest(value: unknown): value is FitnessRecordSaveRequest {
  return Boolean(
    value &&
      typeof value === "object" &&
      "password" in value &&
      "record" in value &&
      typeof value.password === "string" &&
      isFitnessRecord(value.record),
  );
}

function normalizeRecords(records: FitnessRecord[]) {
  return records
    .filter(isFitnessRecord)
    .map((record) => ({
      date: record.date,
      hasPt: record.hasPt,
      memo: record.memo.trim(),
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function readFitnessData(): Promise<FitnessCalendarData> {
  const rawData = await readFile(FITNESS_DATA_PATH, "utf-8");
  const data = JSON.parse(rawData) as Partial<FitnessCalendarData>;

  return {
    records: Array.isArray(data.records) ? normalizeRecords(data.records) : [],
  };
}

async function writeFitnessData(data: FitnessCalendarData) {
  await writeFile(FITNESS_DATA_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

const getFitnessRecords: RequestHandler = async () => {
  return json(await readFitnessData());
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

  const data = await readFitnessData();
  const records = normalizeRecords([
    ...data.records.filter((record) => record.date !== payload.record.date),
    payload.record,
  ]);
  const nextData: FitnessCalendarData = { records };

  await writeFitnessData(nextData);

  return json(nextData);
};

export const GET = withApiHook(getFitnessRecords);
export const POST = withApiHook(saveFitnessRecord);
