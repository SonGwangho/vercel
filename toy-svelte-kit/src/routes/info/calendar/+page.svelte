<script lang="ts">
  import type { DayOffItem, DayOffYearGroup } from "$lib";
  import dayOffSource from "$lib/assets/data/calendar/dayOff.json";

  type CalendarCell = {
    key: string;
    date: Date;
    day: number;
    inCurrentMonth: boolean;
    isToday: boolean;
    isSunday: boolean;
    isSaturday: boolean;
    isHoliday: boolean;
    holidayName: string;
  };

  const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const DAY_MS = 24 * 60 * 60 * 1000;

  const today = startOfDay(new Date());
  let visibleMonth = $state(new Date(today.getFullYear(), today.getMonth(), 1));
  let selectedDateKey = $state<string | null>(null);
  const visibleYearKey = $derived(String(visibleMonth.getFullYear()));

  const dayOffItems = $derived(readDayOffItems(dayOffSource, visibleYearKey));
  const dayOffMap = $derived(new Map(dayOffItems.map((item) => [item.date, item.name])));

  const monthLabel = $derived(
    `${visibleMonth.getFullYear()}년 ${String(visibleMonth.getMonth() + 1).padStart(2, "0")}월`,
  );

  const cells = $derived(buildCalendarCells(visibleMonth, selectedDateKey, today, dayOffMap));
  const selectedCell = $derived(cells.find((cell) => cell.key === selectedDateKey) ?? null);
  const nextHoliday = $derived(findNextHoliday(today, dayOffItems));
  const summary = $derived(createSummary(today, selectedCell, nextHoliday, dayOffMap));

  function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function isDayOffItem(value: unknown): value is DayOffItem {
    return Boolean(
      value &&
        typeof value === "object" &&
        "date" in value &&
        "name" in value &&
        typeof value.date === "string" &&
        typeof value.name === "string",
    );
  }

  function readDayOffItems(source: unknown, yearKey: string) {
    if (Array.isArray(source)) {
      return source.filter(isDayOffItem);
    }

    if (!source || typeof source !== "object") {
      return [];
    }

    const yearGroup = (source as Record<string, DayOffYearGroup | undefined>)[yearKey];
    if (!yearGroup || !Array.isArray(yearGroup.dayOffs)) {
      return [];
    }

    return yearGroup.dayOffs.filter(isDayOffItem);
  }

  function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(dateKey: string) {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
  }

  function diffFromToday(targetDate: Date, baseDate: Date) {
    return Math.round((startOfDay(targetDate).getTime() - startOfDay(baseDate).getTime()) / DAY_MS);
  }

  function formatDiffText(diffDays: number) {
    if (diffDays === 0) {
      return "오늘";
    }

    if (diffDays > 0) {
      return `${diffDays}일 남음`;
    }

    return `${Math.abs(diffDays)}일 지남`;
  }

  function createSummary(
    baseDate: Date,
    selectedCellValue: CalendarCell | null,
    nextHolidayValue: DayOffItem | null,
    holidayMap: Map<string, string>,
  ) {
    if (selectedCellValue) {
      const diffDays = diffFromToday(selectedCellValue.date, baseDate);
      const label = selectedCellValue.isHoliday
        ? selectedCellValue.holidayName
        : `${selectedCellValue.date.getMonth() + 1}월 ${selectedCellValue.day}일`;

      return {
        title: label,
        count: formatDiffText(diffDays),
      };
    }

    if (nextHolidayValue) {
      const nextHolidayDate = parseDateKey(nextHolidayValue.date);
      const diffDays = diffFromToday(nextHolidayDate, baseDate);
      const weekday = WEEK_LABELS[nextHolidayDate.getDay()] ?? "";

      return {
        title: `다음 공휴일 · ${nextHolidayValue.name}`,
        count: formatDiffText(diffDays),
      };
    }

    const todayKey = toDateKey(baseDate);
    const holidayName = holidayMap.get(todayKey);

    return {
      title: holidayName ? holidayName : "다음 공휴일 없음",
      count: "데이터 확인 필요",
    };
  }

  function buildCalendarCells(
    monthDate: Date,
    currentSelectedDateKey: string | null,
    baseDate: Date,
    holidayMap: Map<string, string>,
  ) {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const firstGridDate = new Date(firstDay);
    firstGridDate.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 35 }, (_, index) => {
      const date = new Date(firstGridDate);
      date.setDate(firstGridDate.getDate() + index);

      const key = toDateKey(date);
      const holidayName = holidayMap.get(key) ?? "";
      const isHoliday = holidayMap.has(key);
      const isSunday = date.getDay() === 0;
      const isSaturday = date.getDay() === 6;

      return {
        key,
        date,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === monthDate.getMonth(),
        isToday: key === toDateKey(baseDate),
        isSunday,
        isSaturday,
        isHoliday,
        holidayName,
        isSelected: key === currentSelectedDateKey,
      };
    });
  }

  function findNextHoliday(baseDate: Date, holidays: DayOffItem[]) {
    const currentKey = toDateKey(baseDate);

    return [...holidays]
      .sort((left, right) => left.date.localeCompare(right.date))
      .find((item) => item.date >= currentKey) ?? null;
  }

  function moveMonth(offset: number) {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
  }

  function selectDate(cell: CalendarCell) {
    selectedDateKey = selectedDateKey === cell.key ? null : cell.key;
  }
</script>

<section class="calendar-page">
  <div class="calendar-shell">
    <div class="calendar-summary">
      <p class="summary-kicker">{summary.title}</p>
      <strong>{summary.count}</strong>
    </div>

    <div class="calendar-panel">
      <div class="calendar-toolbar">
        <button type="button" class="month-button" onclick={() => moveMonth(-1)} aria-label="이전 달">
          ‹
        </button>
        <h1>{monthLabel}</h1>
        <button type="button" class="month-button" onclick={() => moveMonth(1)} aria-label="다음 달">
          ›
        </button>
      </div>

      <div class="weekdays" aria-hidden="true">
        {#each WEEK_LABELS as label}
          <div>{label}</div>
        {/each}
      </div>

      <div class="calendar-grid">
        {#each cells as cell}
          <button
            type="button"
            class={`calendar-cell ${cell.inCurrentMonth ? "" : "is-muted"} ${cell.isToday ? "is-today" : ""} ${cell.isHoliday || cell.isSunday ? "is-red" : ""} ${cell.isSaturday && !cell.isHoliday ? "is-blue" : ""} ${cell.key === selectedDateKey ? "is-selected" : ""}`}
            onclick={() => selectDate(cell)}
            aria-pressed={cell.key === selectedDateKey}
          >
            <span class="day-number">{cell.day}</span>
            {#if cell.holidayName}
              <small>{cell.holidayName}</small>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>
</section>

<style>
  .calendar-page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 12px 0 40px;
  }

  .calendar-shell {
    display: grid;
    gap: 16px;
  }

  .calendar-summary,
  .calendar-panel {
    border-radius: 26px;
    border: 1px solid rgba(226, 232, 240, 0.9);
    background: #fff;
    box-shadow: 0 16px 32px rgba(15, 23, 42, 0.07);
  }

  .calendar-summary {
    display: grid;
    gap: 8px;
    padding: 26px 28px;
  }

  .summary-kicker {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    color: #64748b;
  }

  .calendar-summary strong {
    font-size: clamp(34px, 6vw, 54px);
    line-height: 1;
    letter-spacing: -0.05em;
    color: #0f172a;
  }

  .calendar-panel {
    padding: 22px;
  }

  .calendar-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .calendar-toolbar h1 {
    margin: 0;
    font-size: clamp(28px, 4vw, 36px);
    line-height: 1.05;
    letter-spacing: -0.04em;
    color: #0f172a;
  }

  .month-button {
    width: 44px;
    height: 44px;
    border: 1px solid #dbe4ef;
    border-radius: 14px;
    background: #f8fafc;
    color: #0f172a;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }

  .weekdays,
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .weekdays {
    border-top: 1px solid #e5e7eb;
    border-left: 1px solid #e5e7eb;
  }

  .weekdays div {
    padding: 12px 8px;
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
    font-size: 13px;
    font-weight: 800;
    color: #64748b;
    background: #f8fafc;
  }

  .calendar-grid {
    border-left: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
  }

  .calendar-cell {
    min-height: 104px;
    padding: 12px 10px;
    border: 0;
    border-right: 1px solid #e5e7eb;
    border-top: 1px solid #e5e7eb;
    background: #fff;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      box-shadow 0.16s ease,
      color 0.16s ease;
  }

  .calendar-cell:hover {
    background: #f8fafc;
  }

  .calendar-cell.is-selected {
    background: #eef6ff;
    box-shadow: inset 0 0 0 2px #bfdcff;
  }

  .calendar-cell.is-today .day-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    border-radius: 999px;
    background: #0f172a;
    color: #fff;
    padding: 0 10px;
  }

  .calendar-cell.is-muted {
    background: #fcfcfd;
  }

  .calendar-cell.is-muted .day-number,
  .calendar-cell.is-muted small {
    opacity: 0.4;
  }

  .day-number {
    font-size: 18px;
    font-weight: 800;
    color: #111827;
  }

  .calendar-cell small {
    font-size: 12px;
    line-height: 1.35;
    font-weight: 700;
    color: #94a3b8;
    word-break: keep-all;
  }

  .weekdays div:first-child,
  .calendar-cell.is-red .day-number,
  .calendar-cell.is-red small {
    color: #dc2626;
  }

  .weekdays div:last-child,
  .calendar-cell.is-blue .day-number,
  .calendar-cell.is-blue small {
    color: #2563eb;
  }

  @media (max-width: 720px) {
    .calendar-summary {
      padding: 22px 18px;
    }

    .calendar-panel {
      padding: 14px;
    }

    .calendar-toolbar {
      margin-bottom: 14px;
    }

    .month-button {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      font-size: 24px;
    }

    .weekdays div {
      padding: 10px 6px;
      font-size: 12px;
      text-align: center;
    }

    .calendar-cell {
      min-height: 78px;
      padding: 8px 6px;
      gap: 4px;
    }

    .day-number {
      font-size: 15px;
    }

    .calendar-cell small {
      font-size: 10px;
    }
  }

  :global(html[data-theme="dark"]) .calendar-summary,
  :global(html[data-theme="dark"]) .calendar-panel {
    background: #1c1917;
    border-color: rgba(255, 255, 255, 0.08);
  }

  :global(html[data-theme="dark"]) .summary-kicker,
  :global(html[data-theme="dark"]) .weekdays div,
  :global(html[data-theme="dark"]) .calendar-cell small {
    color: #d6d3d1;
  }

  :global(html[data-theme="dark"]) .calendar-summary strong,
  :global(html[data-theme="dark"]) .calendar-toolbar h1,
  :global(html[data-theme="dark"]) .month-button,
  :global(html[data-theme="dark"]) .day-number {
    color: #fafaf9;
  }

  :global(html[data-theme="dark"]) .month-button,
  :global(html[data-theme="dark"]) .weekdays div,
  :global(html[data-theme="dark"]) .calendar-cell,
  :global(html[data-theme="dark"]) .calendar-cell.is-muted {
    background: #292524;
    border-color: rgba(255, 255, 255, 0.08);
  }

  :global(html[data-theme="dark"]) .calendar-cell:hover {
    background: #312c2a;
  }

  :global(html[data-theme="dark"]) .calendar-cell.is-selected {
    background: #1d3246;
    box-shadow: inset 0 0 0 2px rgba(125, 179, 255, 0.55);
  }

  :global(html[data-theme="dark"]) .calendar-cell.is-today .day-number {
    background: #fafaf9;
    color: #1c1917;
  }

  :global(html[data-theme="dark"]) .weekdays div:first-child,
  :global(html[data-theme="dark"]) .calendar-cell.is-red .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.is-red small {
    color: #f87171;
  }

  :global(html[data-theme="dark"]) .weekdays div:last-child,
  :global(html[data-theme="dark"]) .calendar-cell.is-blue .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.is-blue small {
    color: #60a5fa;
  }
</style>
