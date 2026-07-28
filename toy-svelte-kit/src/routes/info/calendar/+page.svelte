<script lang="ts">
  import { onMount, tick } from "svelte";

  import type {
    CalendarMarkColor,
    DayOffItem,
    DayOffYearGroup,
    PersonalDayOffData,
    PersonalDayOffItem,
  } from "$lib";
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
    customName: string;
    customColor: CalendarMarkColor | null;
    displayName: string;
    markerTone: CalendarMarkColor | null;
  };

  const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const DAY_MS = 24 * 60 * 60 * 1000;
  const COLOR_OPTIONS: { value: CalendarMarkColor; label: string }[] = [
    { value: "default", label: "기본색" },
    { value: "red", label: "빨간색" },
    { value: "orange", label: "주황" },
    { value: "yellow", label: "노랑" },
    { value: "green", label: "초록" },
    { value: "blue", label: "파랑" },
    { value: "indigo", label: "남색" },
    { value: "purple", label: "보라" },
  ];

  const today = startOfDay(new Date());
  let visibleMonth = $state(new Date(today.getFullYear(), today.getMonth(), 1));
  let selectedDateKey = $state<string | null>(null);
  let personalDayOffs = $state<PersonalDayOffItem[]>([]);
  let editorDateKey = $state<string | null>(null);
  let editorName = $state("");
  let editorColor = $state<CalendarMarkColor>("default");
  let editorNameError = $state(false);
  let editorNameInput = $state<HTMLInputElement | null>(null);
  let dataMessage = $state("");
  let dataSaving = $state(false);
  const visibleYearKey = $derived(String(visibleMonth.getFullYear()));

  const dayOffItems = $derived(readDayOffItems(dayOffSource, visibleYearKey));
  const dayOffMap = $derived(
    new Map(dayOffItems.map((item) => [item.date, item.name])),
  );
  const personalDayOffMap = $derived(
    new Map(personalDayOffs.map((item) => [item.date, item])),
  );

  const monthLabel = $derived(
    `${visibleMonth.getFullYear()}년 ${String(visibleMonth.getMonth() + 1).padStart(2, "0")}월`,
  );

  const cells = $derived(
    buildCalendarCells(
      visibleMonth,
      selectedDateKey,
      today,
      dayOffMap,
      personalDayOffMap,
    ),
  );
  const selectedCell = $derived(
    cells.find((cell) => cell.key === selectedDateKey) ?? null,
  );
  const nextHoliday = $derived(findNextHoliday(today, dayOffItems));
  const editorCell = $derived(
    cells.find((cell) => cell.key === editorDateKey) ?? null,
  );
  const summary = $derived(
    createSummary(today, selectedCell, nextHoliday, dayOffMap),
  );

  onMount(() => {
    void loadPersonalDayOffs();
  });

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

  function isPersonalDayOffItem(value: unknown): value is PersonalDayOffItem {
    return Boolean(
      isDayOffItem(value) &&
        value &&
        typeof value === "object" &&
        "color" in value &&
        typeof value.color === "string" &&
        COLOR_OPTIONS.some((option) => option.value === value.color),
    );
  }

  function readDayOffItems(source: unknown, yearKey: string) {
    if (Array.isArray(source)) {
      return source.filter(isDayOffItem);
    }

    if (!source || typeof source !== "object") {
      return [];
    }

    const yearGroup = (source as Record<string, DayOffYearGroup | undefined>)[
      yearKey
    ];
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
    return Math.round(
      (startOfDay(targetDate).getTime() - startOfDay(baseDate).getTime()) /
        DAY_MS,
    );
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
    personalMap: Map<string, PersonalDayOffItem>,
  ) {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const firstGridDate = new Date(firstDay);
    firstGridDate.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstGridDate);
      date.setDate(firstGridDate.getDate() + index);

      const key = toDateKey(date);
      const holidayName = holidayMap.get(key) ?? "";
      const personalItem = personalMap.get(key) ?? null;
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
        customName: personalItem?.name ?? "",
        customColor: personalItem?.color ?? null,
        displayName: personalItem?.name || holidayName,
        markerTone: personalItem?.color ?? null,
        isSelected: key === currentSelectedDateKey,
      };
    });
  }

  function findNextHoliday(baseDate: Date, holidays: DayOffItem[]) {
    const currentKey = toDateKey(baseDate);

    return (
      [...holidays]
        .sort((left, right) => left.date.localeCompare(right.date))
        .find((item) => item.date >= currentKey) ?? null
    );
  }

  function moveMonth(offset: number) {
    visibleMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + offset,
      1,
    );
  }

  function selectDate(cell: CalendarCell) {
    selectedDateKey = selectedDateKey === cell.key ? null : cell.key;
  }

  function toPlainPersonalDayOffItems(items: PersonalDayOffItem[]) {
    return items.map((item) => ({
      date: item.date,
      name: item.name,
      color: item.color,
    }));
  }

  async function loadPersonalDayOffs() {
    dataMessage = "";

    try {
      const response = await fetch("/api/calendar");
      if (!response.ok) {
        throw new Error("Calendar request failed.");
      }

      const data = (await response.json()) as PersonalDayOffData;
      personalDayOffs = toPlainPersonalDayOffItems(
        Array.isArray(data.items) ? data.items.filter(isPersonalDayOffItem) : [],
      );
    } catch {
      dataMessage = "일정을 불러오지 못했습니다.";
    }
  }

  async function persistPersonalDayOff(item: PersonalDayOffItem) {
    dataSaving = true;
    dataMessage = "";

    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(item),
      });
      if (!response.ok) {
        throw new Error("Calendar save failed.");
      }

      const data = (await response.json()) as PersonalDayOffData;
      personalDayOffs = toPlainPersonalDayOffItems(
        Array.isArray(data.items) ? data.items.filter(isPersonalDayOffItem) : [],
      );
      return true;
    } catch {
      dataMessage = "일정을 저장하지 못했습니다.";
      return false;
    } finally {
      dataSaving = false;
    }
  }

  async function removePersonalDayOff(date: string) {
    dataSaving = true;
    dataMessage = "";

    try {
      const response = await fetch(
        `/api/calendar?date=${encodeURIComponent(date)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error("Calendar delete failed.");
      }

      const data = (await response.json()) as PersonalDayOffData;
      personalDayOffs = toPlainPersonalDayOffItems(
        Array.isArray(data.items) ? data.items.filter(isPersonalDayOffItem) : [],
      );
      return true;
    } catch {
      dataMessage = "일정을 삭제하지 못했습니다.";
      return false;
    } finally {
      dataSaving = false;
    }
  }

  async function openEditor(cell: CalendarCell) {
    editorDateKey = cell.key;
    editorName = cell.customName;
    editorColor = cell.customColor ?? "default";
    editorNameError = false;
    selectedDateKey = cell.key;
    await tick();
    editorNameInput?.focus();
    editorNameInput?.select();
  }

  function closeEditor() {
    editorDateKey = null;
    editorName = "";
    editorColor = "default";
    editorNameError = false;
  }

  async function saveEditor() {
    if (!editorDateKey) {
      return;
    }

    const trimmedName = editorName.trim();
    if (!trimmedName) {
      editorNameError = true;
      return;
    }
    editorNameError = false;

    const nextItem: PersonalDayOffItem = {
      date: editorDateKey,
      name: trimmedName,
      color: editorColor,
    };

    if (await persistPersonalDayOff(nextItem)) {
      closeEditor();
    }
  }

  async function deleteEditor() {
    if (!editorDateKey) {
      return;
    }

    if (await removePersonalDayOff(editorDateKey)) {
      closeEditor();
    }
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
        <button
          type="button"
          class="month-button"
          onclick={() => moveMonth(-1)}
          aria-label="이전 달"
        >
          ‹
        </button>
        <h1>{monthLabel}</h1>
        <button
          type="button"
          class="month-button"
          onclick={() => moveMonth(1)}
          aria-label="다음 달"
        >
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
            class={`calendar-cell ${cell.inCurrentMonth ? "" : "is-muted"} ${cell.isToday ? "is-today" : ""} ${cell.isHoliday || cell.isSunday ? "is-red" : ""} ${cell.isSaturday && !cell.isHoliday ? "is-blue" : ""} ${cell.key === selectedDateKey ? "is-selected" : ""} ${cell.markerTone ? `tone-${cell.markerTone}` : ""}`}
            onclick={() => selectDate(cell)}
            ondblclick={() => openEditor(cell)}
            aria-pressed={cell.key === selectedDateKey}
            aria-label={`${cell.key}${cell.displayName ? `, ${cell.displayName}` : ""}`}
          >
            <span class="day-number">{cell.day}</span>
            {#if cell.displayName}
              <small>{cell.displayName}</small>
            {/if}
          </button>
        {/each}
      </div>

      {#if selectedCell}
        <div class="selection-action">
          <div>
            <strong>{selectedCell.key}</strong>
            <span>{selectedCell.displayName || "등록된 일정 없음"}</span>
          </div>
          <button type="button" onclick={() => void openEditor(selectedCell)}>
            일정 편집
          </button>
        </div>
      {/if}

      {#if dataMessage}
        <p class="storage-message" role="alert">{dataMessage}</p>
      {/if}
    </div>
  </div>
</section>

{#if editorCell}
  <div
    class="editor-modal-backdrop"
    onclick={closeEditor}
    aria-hidden="true"
  ></div>
  <div class="editor-modal-wrap">
    <div
      class="editor-panel editor-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-editor-title"
      tabindex="-1"
    >
      <div class="editor-head">
        <div>
          <strong id="calendar-editor-title">{editorDateKey}</strong>
        </div>
        <button
          type="button"
          class="editor-close"
          onclick={closeEditor}
          aria-label="편집 닫기"
        >
          ×
        </button>
      </div>

      <label class="editor-field">
        <span>메모</span>
        <input
          bind:this={editorNameInput}
          bind:value={editorName}
          class:error={editorNameError}
          type="text"
          maxlength="20"
          placeholder="예: 병원, 약속, 휴가"
          oninput={() => (editorNameError = false)}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void saveEditor();
            }
          }}
          aria-invalid={editorNameError}
          title={editorNameError
            ? "메모는 필수 입력입니다."
            : undefined}
        />
        {#if editorNameError}
          <small class="field-error"
            >메모를 입력해 주세요.</small
          >
        {/if}
      </label>

      <div class="editor-field">
        <span>색상</span>
        <div class="color-options">
          {#each COLOR_OPTIONS as option}
            <button
              type="button"
              class={`color-option tone-${option.value} ${editorColor === option.value ? "is-active" : ""}`}
              onclick={() => {
                editorColor = option.value;
                editorNameError = false;
              }}
              aria-pressed={editorColor === option.value}
            >
              {option.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="editor-actions">
        <button
          type="button"
          class="action-button ghost"
          onclick={() => void deleteEditor()}
          disabled={dataSaving}
        >
          삭제
        </button>
        <button
          type="button"
          class="action-button primary"
          onclick={() => void saveEditor()}
          disabled={dataSaving}
        >
          {dataSaving ? "저장 중" : "저장"}
        </button>
      </div>
      {#if dataMessage}
        <p class="storage-message" role="alert">{dataMessage}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .calendar-page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 8px 0 40px;
    color: var(--text);
  }

  .calendar-shell {
    display: grid;
    gap: 16px;
  }

  .calendar-summary,
  .calendar-panel,
  .editor-panel {
    border-radius: var(--panel-radius);
    border: 1px solid var(--line);
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  .calendar-summary {
    display: grid;
    gap: 8px;
    padding: 26px 28px;
  }

  .summary-kicker,
  .editor-kicker {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    color: var(--muted);
  }

  .calendar-summary strong {
    font-family: var(--font-numeric);
    font-size: 3.375rem;
    line-height: 1;
    letter-spacing: 0;
    color: var(--text-strong);
  }

  .calendar-panel,
  .editor-panel {
    padding: 22px;
  }

  .calendar-toolbar,
  .editor-head,
  .editor-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .calendar-toolbar {
    margin-bottom: 18px;
  }

  .calendar-toolbar h1,
  .editor-head strong {
    margin: 0;
    font-size: 2.25rem;
    line-height: 1.05;
    letter-spacing: 0;
    color: var(--text-strong);
  }

  .editor-head strong {
    font-size: 24px;
  }

  .month-button,
  .editor-close {
    width: 44px;
    height: 44px;
    border: 1px solid var(--line);
    border-radius: var(--control-radius);
    background: var(--surface-muted);
    color: var(--text-strong);
    font-size: 28px;
    line-height: 1;
    cursor: pointer;
  }

  .editor-close {
    font-size: 26px;
  }

  .weekdays,
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .weekdays {
    border-top: 1px solid var(--line);
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
  }

  .weekdays div {
    padding: 12px 8px;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    text-align: left;
    font-size: 13px;
    font-weight: 800;
    color: var(--muted);
    background: var(--surface-muted);
  }

  .calendar-grid {
    border-left: 1px solid var(--line);
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .calendar-cell {
    min-height: 104px;
    padding: 12px 10px;
    border: 0;
    border-right: 1px solid var(--line);
    border-top: 1px solid var(--line);
    background: var(--surface);
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
    background: var(--surface-muted);
  }

  .calendar-cell.is-selected {
    background: var(--brand-soft);
    box-shadow: inset 0 0 0 2px var(--brand);
  }

  .calendar-cell.is-today .day-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    border-radius: 999px;
    background: var(--brand);
    color: var(--on-brand);
    padding: 0 10px;
  }

  .calendar-cell.is-muted {
    background: var(--surface-muted);
  }

  .calendar-cell.is-muted .day-number,
  .calendar-cell.is-muted small {
    opacity: 0.4;
  }

  .day-number {
    font-size: 18px;
    font-weight: 800;
    color: var(--text-strong);
  }

  .calendar-cell small {
    font-size: 12px;
    line-height: 1.35;
    font-weight: 700;
    color: #94a3b8;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .selection-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 16px;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: var(--panel-radius-sm);
    background: var(--surface-muted);
  }

  .selection-action div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .selection-action strong {
    color: var(--text-strong);
    font-family: var(--font-numeric);
    font-size: 0.9rem;
  }

  .selection-action span {
    overflow: hidden;
    color: var(--muted);
    font-size: 0.82rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selection-action button {
    min-height: 38px;
    padding: 0 13px;
    border: 0;
    border-radius: var(--control-radius);
    background: var(--brand);
    color: var(--on-brand);
    font-size: 0.82rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .storage-message {
    margin: 10px 0 0;
    color: var(--danger);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .weekdays div:first-child,
  .calendar-cell.is-red .day-number,
  .calendar-cell.is-red small,
  .calendar-cell.tone-red .day-number,
  .calendar-cell.tone-red small {
    color: #dc2626;
  }

  .calendar-cell.tone-orange .day-number,
  .calendar-cell.tone-orange small {
    color: #ea580c;
  }

  .calendar-cell.tone-yellow .day-number,
  .calendar-cell.tone-yellow small {
    color: #ca8a04;
  }

  .calendar-cell.tone-green .day-number,
  .calendar-cell.tone-green small {
    color: #16a34a;
  }

  .calendar-cell.tone-blue .day-number,
  .calendar-cell.tone-blue small {
    color: #2563eb;
  }

  .calendar-cell.tone-indigo .day-number,
  .calendar-cell.tone-indigo small {
    color: #4338ca;
  }

  .calendar-cell.tone-purple .day-number,
  .calendar-cell.tone-purple small {
    color: #9333ea;
  }

  .weekdays div:last-child,
  .calendar-cell.is-blue .day-number,
  .calendar-cell.is-blue small {
    color: #2563eb;
  }

  .editor-panel {
    display: grid;
    gap: 18px;
  }

  .editor-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.46);
    backdrop-filter: blur(3px);
    z-index: 40;
  }

  .editor-modal-wrap {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    z-index: 41;
  }

  .editor-modal {
    width: min(100%, 520px);
    max-height: calc(100vh - 40px);
    overflow: auto;
  }

  .editor-field {
    display: grid;
    gap: 10px;
  }

  .editor-field span {
    font-size: 14px;
    font-weight: 800;
    color: #475569;
  }

  .editor-field input {
    width: 100%;
    height: 48px;
    border-radius: 14px;
    border: 1px solid #dbe4ef;
    background: #fff;
    padding: 0 14px;
    font-size: 15px;
    color: #0f172a;
  }

  .editor-field input.error {
    border-color: #dc2626;
    box-shadow: inset 0 0 0 1px rgba(220, 38, 38, 0.2);
  }

  .field-error {
    font-size: 12px;
    font-weight: 700;
    color: #dc2626;
  }

  .color-options {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .color-option,
  .action-button {
    height: 42px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid #dbe4ef;
    background: #fff;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }

  .color-option.is-active {
    box-shadow: inset 0 0 0 2px currentColor;
  }

  .color-option.tone-default {
    color: #475569;
  }

  .color-option.tone-red {
    color: #dc2626;
  }

  .color-option.tone-orange {
    color: #ea580c;
  }

  .color-option.tone-yellow {
    color: #ca8a04;
  }

  .color-option.tone-green {
    color: #16a34a;
  }

  .color-option.tone-blue {
    color: #2563eb;
  }

  .color-option.tone-indigo {
    color: #4338ca;
  }

  .color-option.tone-purple {
    color: #9333ea;
  }

  .action-button.ghost {
    color: #475569;
    background: #f8fafc;
  }

  .action-button.primary {
    color: #fff;
    background: #0f766e;
    border-color: #0f766e;
  }

  @media (max-width: 720px) {
    .selection-action {
      align-items: stretch;
      flex-direction: column;
    }

    .selection-action button {
      width: 100%;
    }

    .calendar-summary {
      padding: 22px 18px;
    }

    .calendar-panel,
    .editor-panel {
      padding: 14px;
    }

    .calendar-toolbar {
      margin-bottom: 14px;
    }

    .month-button,
    .editor-close {
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

    .editor-head,
    .editor-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .action-button {
      width: 100%;
    }

    .editor-modal-wrap {
      padding: 14px;
    }

    .editor-modal {
      width: 100%;
      max-height: calc(100vh - 28px);
    }
  }

  :global(html[data-theme="dark"]) .calendar-summary,
  :global(html[data-theme="dark"]) .calendar-panel,
  :global(html[data-theme="dark"]) .editor-panel {
    background: var(--surface);
    border-color: var(--line);
  }

  :global(html[data-theme="dark"]) .summary-kicker,
  :global(html[data-theme="dark"]) .editor-kicker,
  :global(html[data-theme="dark"]) .weekdays div,
  :global(html[data-theme="dark"]) .calendar-cell small,
  :global(html[data-theme="dark"]) .editor-field span {
    color: var(--muted);
  }

  :global(html[data-theme="dark"]) .calendar-summary strong,
  :global(html[data-theme="dark"]) .calendar-toolbar h1,
  :global(html[data-theme="dark"]) .editor-head strong,
  :global(html[data-theme="dark"]) .month-button,
  :global(html[data-theme="dark"]) .editor-close,
  :global(html[data-theme="dark"]) .day-number,
  :global(html[data-theme="dark"]) .editor-field input {
    color: var(--text-strong);
  }

  :global(html[data-theme="dark"]) .month-button,
  :global(html[data-theme="dark"]) .editor-close,
  :global(html[data-theme="dark"]) .weekdays div,
  :global(html[data-theme="dark"]) .calendar-cell,
  :global(html[data-theme="dark"]) .calendar-cell.is-muted,
  :global(html[data-theme="dark"]) .editor-field input,
  :global(html[data-theme="dark"]) .color-option,
  :global(html[data-theme="dark"]) .action-button.ghost {
    background: var(--surface-muted);
    border-color: var(--line);
  }

  :global(html[data-theme="dark"]) .editor-field input.error,
  :global(html[data-theme="dark"]) .field-error {
    color: #fca5a5;
    border-color: #f87171;
  }

  :global(html[data-theme="dark"]) .calendar-cell:hover {
    background: var(--surface-strong);
  }

  :global(html[data-theme="dark"]) .calendar-cell.is-selected {
    background: var(--brand-soft);
    box-shadow: inset 0 0 0 2px var(--brand);
  }

  :global(html[data-theme="dark"]) .calendar-cell.is-today .day-number {
    background: var(--brand);
    color: var(--on-brand);
  }

  :global(html[data-theme="dark"]) .weekdays div:first-child,
  :global(html[data-theme="dark"]) .calendar-cell.is-red .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.is-red small,
  :global(html[data-theme="dark"]) .calendar-cell.tone-red .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.tone-red small,
  :global(html[data-theme="dark"]) .color-option.tone-red {
    color: #f87171;
  }

  :global(html[data-theme="dark"]) .calendar-cell.tone-orange .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.tone-orange small,
  :global(html[data-theme="dark"]) .color-option.tone-orange {
    color: #fb923c;
  }

  :global(html[data-theme="dark"]) .calendar-cell.tone-yellow .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.tone-yellow small,
  :global(html[data-theme="dark"]) .color-option.tone-yellow {
    color: #facc15;
  }

  :global(html[data-theme="dark"]) .calendar-cell.tone-green .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.tone-green small,
  :global(html[data-theme="dark"]) .color-option.tone-green {
    color: #4ade80;
  }

  :global(html[data-theme="dark"]) .calendar-cell.tone-blue .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.tone-blue small,
  :global(html[data-theme="dark"]) .color-option.tone-blue {
    color: #60a5fa;
  }

  :global(html[data-theme="dark"]) .calendar-cell.tone-indigo .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.tone-indigo small,
  :global(html[data-theme="dark"]) .color-option.tone-indigo {
    color: #818cf8;
  }

  :global(html[data-theme="dark"]) .calendar-cell.tone-purple .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.tone-purple small,
  :global(html[data-theme="dark"]) .color-option.tone-purple {
    color: #c084fc;
  }

  :global(html[data-theme="dark"]) .weekdays div:last-child,
  :global(html[data-theme="dark"]) .calendar-cell.is-blue .day-number,
  :global(html[data-theme="dark"]) .calendar-cell.is-blue small {
    color: #60a5fa;
  }
</style>
