export type DayOffItem = {
  date: string;
  name: string;
};

export type DayOffYearGroup = {
  dayOffs: DayOffItem[];
};

export type CalendarMarkColor =
  | "default"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "indigo"
  | "purple";

export type PersonalDayOffItem = {
  date: string;
  name: string;
  color: CalendarMarkColor;
};

export type PersonalDayOffData = {
  items: PersonalDayOffItem[];
};
