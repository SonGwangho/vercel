export type FitnessRecord = {
  date: string;
  hasPt: boolean;
  memo: string;
};

export type FitnessCalendarData = {
  records: FitnessRecord[];
};

export type FitnessRecordSaveRequest = {
  record: FitnessRecord;
};

export type FitnessRecordSaveResponse = FitnessCalendarData;
