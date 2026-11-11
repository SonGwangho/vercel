export type FitnessMemo = {
  id: string;
  author: string;
  body: string;
  revision: number;
};

export type FitnessRecord = {
  date: string;
  isUnavailable: boolean;
  isAvailable: boolean;
  memo: string;
  memos: FitnessMemo[];
};

export type FitnessCalendarData = {
  records: FitnessRecord[];
};

export type FitnessRecordSaveRequest =
  | { action: "availability"; date: string; isAvailable: boolean; isUnavailable: boolean }
  | { action: "addMemo" | "editMemo"; date: string; memo: FitnessMemo };

export type FitnessRecordSaveResponse = FitnessCalendarData;
