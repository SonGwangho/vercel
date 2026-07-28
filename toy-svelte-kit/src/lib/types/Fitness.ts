export type FitnessRecord = {
  date: string;
  isUnavailable: boolean;
  isAvailable: boolean;
  memo: string;
};

export type FitnessCalendarData = {
  records: FitnessRecord[];
};

export type FitnessRecordSaveRequest = {
  record: FitnessRecord;
};

export type FitnessRecordSaveResponse = FitnessCalendarData;
