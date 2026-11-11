<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";

  import type {
    DayOffItem,
    DayOffYearGroup,
    FitnessCalendarData,
    FitnessRecord,
    FitnessRecordSaveResponse,
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
    record: FitnessRecord | null;
    hasMemo: boolean;
    isSelected: boolean;
  };

  const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const today = startOfDay(new Date());

  let visibleMonth = $state(new Date(today.getFullYear(), today.getMonth(), 1));
  let selectedDateKey = $state(toDateKey(today));
  let editableRecords = $state<FitnessRecord[]>([]);
  let recordsLoading = $state(true);
  let recordsError = $state("");
  let editorDateKey = $state<string | null>(null);
  let editorIsUnavailable = $state(false);
  let editorIsAvailable = $state(false);
  let editorMemo = $state("");
  let editorError = $state("");
  let editorSaving = $state(false);
  let memoTextarea = $state<HTMLTextAreaElement | null>(null);
  let editorDialog = $state<HTMLDialogElement | null>(null);

  const device = $derived(page.url.searchParams.get("device"));
  const deviceMode = $derived(device === "mobile" || device === "pc" ? device : "auto");
  const records = $derived(editableRecords);
  const recordMap = $derived(new Map(records.map((record) => [record.date, record])));
  const visibleYearKey = $derived(String(visibleMonth.getFullYear()));
  const dayOffItems = $derived(readDayOffItems(dayOffSource, visibleYearKey));
  const dayOffMap = $derived(new Map(dayOffItems.map((item) => [item.date, item.name])));
  const monthLabel = $derived(
    `${visibleMonth.getFullYear()}년 ${String(visibleMonth.getMonth() + 1).padStart(2, "0")}월`,
  );
  const cells = $derived(
    buildCalendarCells(visibleMonth, selectedDateKey, today, recordMap, dayOffMap),
  );

  onMount(() => {
    void loadFitnessRecords();
  });

  function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toDateKey(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

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
        !(value.isUnavailable && value.isAvailable),
    );
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

    const yearGroup = (source as Record<string, DayOffYearGroup | undefined>)[
      yearKey
    ];
    if (!yearGroup || !Array.isArray(yearGroup.dayOffs)) {
      return [];
    }

    return yearGroup.dayOffs.filter(isDayOffItem);
  }

  function readFitnessRecords(source: unknown) {
    if (!source || typeof source !== "object") {
      return [];
    }

    const sourceRecords = (source as Partial<FitnessCalendarData>).records;
    if (!Array.isArray(sourceRecords)) {
      return [];
    }

    return sourceRecords.filter(isFitnessRecord).sort((left, right) => left.date.localeCompare(right.date));
  }

  function toPlainFitnessRecords(sourceRecords: FitnessRecord[]) {
    return sourceRecords
      .filter(isFitnessRecord)
      .map((record) => ({
        date: record.date,
        isUnavailable: record.isUnavailable,
        isAvailable: record.isAvailable,
        memo: record.memo,
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  function buildCalendarCells(
    monthDate: Date,
    currentSelectedDateKey: string | null,
    baseDate: Date,
    recordsByDate: Map<string, FitnessRecord>,
    holidaysByDate: Map<string, string>,
  ) {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const firstGridDate = new Date(firstDay);
    firstGridDate.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstGridDate);
      date.setDate(firstGridDate.getDate() + index);

      const key = toDateKey(date);
      const record = recordsByDate.get(key) ?? null;
      const holidayName = holidaysByDate.get(key) ?? "";

      return {
        key,
        date,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === monthDate.getMonth(),
        isToday: key === toDateKey(baseDate),
        isSunday: date.getDay() === 0,
        isSaturday: date.getDay() === 6,
        isHoliday: holidaysByDate.has(key),
        holidayName,
        record,
        hasMemo: Boolean(record?.memo.trim()),
        isSelected: key === currentSelectedDateKey,
      };
    });
  }

  function moveMonth(offset: number) {
    const nextMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + offset,
      1,
    );

    visibleMonth = nextMonth;
    selectedDateKey = toDateKey(nextMonth);
    void loadFitnessRecords();
  }

  function goToToday() {
    visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDateKey = toDateKey(today);
    void loadFitnessRecords();
  }

  async function loadFitnessRecords() {
    recordsLoading = true;
    recordsError = "";

    try {
      const response = await fetch("/api/fitness");

      if (!response.ok) {
        recordsError = "운동 기록을 불러오지 못했습니다.";
        return;
      }

      const data = (await response.json()) as FitnessRecordSaveResponse;
      editableRecords = toPlainFitnessRecords(data.records);
    } catch {
      recordsError = "운동 기록을 불러오지 못했습니다.";
    } finally {
      recordsLoading = false;
    }
  }

  async function openEditor(cell: CalendarCell) {
    selectedDateKey = cell.key;
    editorDateKey = cell.key;
    editorIsUnavailable = cell.record?.isUnavailable ?? false;
    editorIsAvailable = cell.record?.isAvailable ?? false;
    editorMemo = cell.record?.memo ?? "";
    editorError = "";

    await tick();
    editorDialog?.showModal();
    memoTextarea?.focus();
  }

  function closeEditor() {
    editorDialog?.close();
    editorDateKey = null;
    editorIsUnavailable = false;
    editorIsAvailable = false;
    editorMemo = "";
    editorError = "";
    editorSaving = false;
  }

  function dismissEditorFromBackdrop(event: MouseEvent) {
    if (event.target !== editorDialog || !editorDialog) {
      return;
    }

    const bounds = editorDialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    ) {
      closeEditor();
    }
  }

  async function saveEditor() {
    if (!editorDateKey || editorSaving) {
      return;
    }

    const nextRecord: FitnessRecord = {
      date: editorDateKey,
      isUnavailable: editorIsUnavailable,
      isAvailable: editorIsAvailable,
      memo: editorMemo.trim(),
    };

    editorSaving = true;
    editorError = "";

    try {
      const response = await fetch("/api/fitness", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          record: nextRecord,
        }),
      });

      if (!response.ok) {
        editorError = "저장하지 못했습니다.";
        return;
      }

      const data = (await response.json()) as FitnessRecordSaveResponse;
      editableRecords = toPlainFitnessRecords(data.records);
      closeEditor();
    } catch {
      editorError = "저장하지 못했습니다.";
    } finally {
      editorSaving = false;
    }
  }
</script>

<svelte:head>
  <title>약속 캘린더</title>
</svelte:head>

<div class="fitness-viewport" data-device={deviceMode}>
<div class="fitness-layout">
<section class="fitness-page" aria-label="약속 캘린더">
  <header class="calendar-toolbar">
    <div class="month-navigation">
    <button
      type="button"
      class="month-button"
      onclick={() => moveMonth(-1)}
      aria-label="이전 달"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
    </button>
    <h1>{monthLabel}</h1>
    <button
      type="button"
      class="month-button"
      onclick={() => moveMonth(1)}
      aria-label="다음 달"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg>
    </button>
    </div>
    <button type="button" class="today-button" onclick={goToToday}>오늘</button>
  </header>

  <div class="calendar-panel">
    {#if recordsLoading}
      <div class="records-status" role="status" aria-live="polite">
        <span class="loading-spinner" aria-hidden="true"></span>
        <span>기록을 불러오는 중</span>
      </div>
    {:else if recordsError}
      <div class="records-status is-error" role="alert">
        <span>{recordsError}</span>
        <button type="button" onclick={() => void loadFitnessRecords()}>다시 시도</button>
      </div>
    {/if}

    <div class="weekdays" aria-hidden="true">
      {#each WEEK_LABELS as label}
        <div>{label}</div>
      {/each}
    </div>

    <div class="calendar-grid">
      {#each cells as cell}
        <button
          type="button"
          class={`calendar-cell ${cell.inCurrentMonth ? "" : "is-muted"} ${cell.isToday ? "is-today" : ""} ${cell.isHoliday || cell.isSunday ? "is-red" : ""} ${cell.isSaturday && !cell.isHoliday ? "is-blue" : ""} ${cell.isSelected ? "is-selected" : ""}`}
          onclick={() => void openEditor(cell)}
          aria-pressed={cell.isSelected}
          aria-label={`${cell.key}${cell.holidayName ? `, ${cell.holidayName}` : ""}${cell.record?.isUnavailable ? ", 안 되는 날 X" : ""}${cell.record?.isAvailable ? ", 되는 날 O" : ""}${cell.hasMemo ? `, ${cell.record?.memo}` : ""} 편집`}
          >
            <span class="date-line">
              <span class="day-number">{cell.day}</span>
            </span>
            {#if cell.holidayName}
              <small class="holiday-name">{cell.holidayName}</small>
            {/if}
            {#if cell.record?.isUnavailable}
              <span class="status-label is-unavailable" aria-label="안 되는 날">
                X
              </span>
            {:else if cell.record?.isAvailable}
              <span class="status-label is-available" aria-label="되는 날">
                O
              </span>
            {/if}
            {#if cell.hasMemo}
              <small class="record-memo">{cell.record?.memo}</small>
            {/if}
        </button>
      {/each}
    </div>
  </div>
  <div class="calendar-legend" aria-label="일정 표시 안내">
    <span><b class="legend-available">O</b> 되는 날</span>
    <span><b class="legend-unavailable">X</b> 안 되는 날</span>
    <span class="today-legend"><i aria-hidden="true"></i> 오늘</span>
  </div>
</section>

{#if editorDateKey}
    <dialog
      bind:this={editorDialog}
      class="editor-panel"
      aria-labelledby="fitness-editor-title"
      onclick={dismissEditorFromBackdrop}
      oncancel={(event) => { event.preventDefault(); closeEditor(); }}
    >
      <div class="editor-head">
        <h2 id="fitness-editor-title">{editorDateKey}</h2>
        <button type="button" class="editor-close" aria-label="편집 닫기" onclick={closeEditor}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
      </div>

      <div class="availability-options" aria-label="일정 가능 여부">
        <label class="availability-toggle is-available">
          <input
            type="checkbox"
            checked={editorIsAvailable}
            onchange={(event) => {
              editorIsAvailable = event.currentTarget.checked;
              if (editorIsAvailable) {
                editorIsUnavailable = false;
              }
            }}
          />
          <span>되는 날</span>
        </label>
        <label class="availability-toggle is-unavailable">
          <input
            type="checkbox"
            checked={editorIsUnavailable}
            onchange={(event) => {
              editorIsUnavailable = event.currentTarget.checked;
              if (editorIsUnavailable) {
                editorIsAvailable = false;
              }
            }}
          />
          <span>안 되는 날</span>
        </label>
      </div>

      <label class="editor-field">
        <span>메모</span>
        <textarea
          bind:this={memoTextarea}
          bind:value={editorMemo}
          rows="7"
        ></textarea>
      </label>

      {#if editorError}
        <p class="editor-error" role="alert">{editorError}</p>
      {/if}

      <div class="editor-actions">
        <button type="button" class="action-button ghost" onclick={closeEditor}>취소</button>
        <button
          type="button"
          class="action-button primary"
          disabled={editorSaving}
          onclick={() => void saveEditor()}
        >
          {editorSaving ? "저장 중" : "저장"}
        </button>
      </div>
    </dialog>
{/if}
</div>
</div>

<style>
  .fitness-viewport {
    width: 100%;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-color: var(--line-strong) var(--bg);
  }

  .fitness-layout {
    container: fitness / inline-size;
    width: 100%;
    max-width: 1280px;
    margin-inline: auto;
  }

  .fitness-viewport[data-device="mobile"] .fitness-layout {
    max-width: 520px;
  }

  .fitness-viewport[data-device="pc"] .fitness-layout {
    min-width: 860px;
  }

  .fitness-page {
    width: 100%;
    min-height: 100svh;
    padding: 16px 8px 20px;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .calendar-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .month-navigation {
    display: grid;
    flex: 1;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .calendar-toolbar h1 {
    margin: 0;
    color: var(--text-strong);
    font-size: 1.375rem;
    font-weight: 750;
    line-height: 1.3;
    text-align: center;
    white-space: nowrap;
    letter-spacing: -0.025em;
  }

  .month-button,
  .today-button,
  .editor-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    min-width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--control-radius);
    background: var(--surface);
    color: var(--text-strong);
    cursor: pointer;
    transition: background-color 160ms ease-out, border-color 160ms ease-out;
  }

  .month-button svg,
  .editor-close svg {
    width: 20px;
    height: 20px;
  }

  .today-button {
    padding-inline: 12px;
    font-size: 0.875rem;
    font-weight: 650;
  }

  .calendar-panel {
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }

  .records-status {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 44px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-muted);
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 550;
  }

  .records-status.is-error {
    justify-content: space-between;
    background: var(--danger-soft);
    color: var(--danger);
  }

  .records-status button {
    min-height: 44px;
    padding: 6px 12px;
    border: 1px solid currentColor;
    border-radius: var(--control-radius);
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--line-strong);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .weekdays,
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .weekdays div {
    padding: 10px 2px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-muted);
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }

  .calendar-cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    min-width: 0;
    height: clamp(96px, 13svh, 112px);
    overflow: hidden;
    padding: 8px 5px;
    border: 0;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: var(--surface);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: background-color 160ms ease-out;
  }

  .calendar-cell:nth-child(7n) { border-right: 0; }
  .calendar-cell:nth-last-child(-n + 7) { border-bottom: 0; }
  .calendar-cell.is-muted { background: var(--surface-muted); }
  .calendar-cell.is-muted .day-number { color: var(--muted); }
  .calendar-cell.is-selected {
    background: var(--brand-soft);
    box-shadow: inset 0 0 0 2px var(--brand);
  }

  .date-line {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    min-height: 24px;
  }

  .day-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    border-radius: 6px;
    color: var(--text-strong);
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1;
  }

  .weekdays div:first-child,
  .calendar-cell.is-red .day-number,
  .calendar-cell .holiday-name {
    color: var(--danger);
  }

  .weekdays div:last-child,
  .calendar-cell.is-blue .day-number {
    color: var(--brand-strong);
  }

  .calendar-cell.is-today .day-number {
    background: var(--brand);
    color: var(--on-brand);
  }

  .status-label {
    flex-shrink: 0;
    padding-inline: 5px;
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.2;
  }

  .status-label.is-available,
  .legend-available { color: var(--success); }
  .status-label.is-unavailable,
  .legend-unavailable { color: var(--danger); }

  .calendar-cell small {
    display: -webkit-box;
    min-height: 0;
    max-width: 100%;
    overflow: hidden;
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.4;
    white-space: pre-line;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
  }

  .calendar-cell .holiday-name {
    flex-shrink: 0;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .calendar-legend {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 14px;
    color: var(--muted);
    font-size: 0.75rem;
  }

  .calendar-legend > span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .calendar-legend b { font-weight: 750; }
  .today-legend { margin-left: auto; }
  .today-legend i {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--brand);
  }

  :global(body:has(.fitness-viewport .editor-panel[open])) { overflow: hidden; }

  .editor-panel {
    width: min(calc(100% - 24px), 520px);
    max-height: calc(100dvh - 24px - env(safe-area-inset-bottom, 0px));
    margin: auto auto max(12px, env(safe-area-inset-bottom, 0px));
    overflow: auto;
    overscroll-behavior: contain;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: var(--panel-radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-float);
  }

  .editor-panel[open] {
    display: grid;
    gap: 20px;
  }

  .editor-panel::backdrop { background: rgba(12, 18, 28, 0.5); }

  .editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .editor-head h2 {
    margin: 0;
    color: var(--text-strong);
    font-size: 1.25rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .editor-close { background: var(--surface-muted); }

  .availability-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .availability-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 10px 12px;
    border-radius: var(--control-radius);
    font-size: 0.875rem;
    font-weight: 650;
    cursor: pointer;
  }

  .availability-toggle.is-available {
    background: var(--success-soft);
    color: var(--success);
  }

  .availability-toggle.is-unavailable {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .availability-toggle input {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    margin: 0;
  }

  .availability-toggle.is-available input { accent-color: var(--success); }
  .availability-toggle.is-unavailable input { accent-color: var(--danger); }

  .editor-field { display: grid; gap: 8px; }
  .editor-field span {
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .editor-field textarea {
    width: 100%;
    min-height: 160px;
    padding: 12px 14px;
    resize: vertical;
    border: 1px solid var(--line-strong);
    border-radius: var(--control-radius);
    background: var(--surface);
    color: var(--text-strong);
    caret-color: var(--brand);
    font: inherit;
    font-size: 1rem;
    line-height: 1.55;
  }

  .editor-error {
    margin: 0;
    color: var(--danger);
    font-size: 0.875rem;
    font-weight: 600;
  }

  .editor-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .action-button {
    min-height: 48px;
    border: 1px solid var(--line-strong);
    border-radius: var(--control-radius);
    font-size: 0.9375rem;
    font-weight: 650;
    cursor: pointer;
    transition: background-color 160ms ease-out;
  }

  .action-button:disabled { cursor: wait; opacity: 0.68; }
  .action-button.ghost { background: var(--surface-muted); color: var(--text); }
  .action-button.primary { border-color: var(--brand); background: var(--brand); color: var(--on-brand); }

  .month-button:focus-visible,
  .today-button:focus-visible,
  .calendar-cell:focus-visible,
  .records-status button:focus-visible,
  .editor-close:focus-visible,
  .action-button:focus-visible,
  .editor-field textarea:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .calendar-cell:focus-visible { outline-offset: -3px; }

  @media (hover: hover) {
    .month-button:hover,
    .today-button:hover,
    .editor-close:hover,
    .action-button.ghost:hover { background: var(--surface-strong); }
    .calendar-cell:hover { background: var(--brand-soft); }
    .action-button.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--brand) 90%, #000); }
  }

  @media (prefers-reduced-motion: reduce) {
    .month-button,
    .today-button,
    .editor-close,
    .calendar-cell,
    .action-button { transition: none; }
    .loading-spinner { animation: none; }
  }

  /* The container width follows the URL override, including dialogs in the top layer. */
  @container fitness (min-width: 768px) {
    .fitness-page { padding: 28px 32px 24px; }
    .calendar-toolbar { justify-content: space-between; margin-bottom: 24px; }
    .month-navigation { flex: none; grid-template-columns: 44px auto 44px; gap: 16px; }
    .calendar-toolbar h1 { min-width: 210px; font-size: 1.75rem; }
    .today-button { padding-inline: 20px; }
    .weekdays div { padding-block: 12px; font-size: 0.8125rem; }
    .calendar-cell {
      height: clamp(112px, calc((100svh - 188px) / 6), 148px);
      gap: 7px;
      padding: 10px 12px;
    }
    .day-number { min-width: 28px; height: 28px; font-size: 1rem; }
    .status-label { font-size: 0.875rem; }
    .calendar-cell small { font-size: 0.875rem; }
    .calendar-legend { margin-top: 16px; font-size: 0.8125rem; gap: 20px; }
    .editor-panel { width: min(calc(100% - 48px), 560px); margin: auto; padding: 28px; }
    .editor-actions { grid-template-columns: auto auto; justify-content: end; }
    .action-button { min-width: 96px; padding-inline: 24px; }
  }
</style>
