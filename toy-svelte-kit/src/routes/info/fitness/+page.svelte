<script lang="ts">
  import { onMount, tick } from "svelte";

  import type { FitnessCalendarData, FitnessRecord, FitnessRecordSaveResponse } from "$lib";

  type CalendarCell = {
    key: string;
    date: Date;
    day: number;
    inCurrentMonth: boolean;
    isToday: boolean;
    isSunday: boolean;
    isSaturday: boolean;
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
  let editorHasPt = $state(false);
  let editorMemo = $state("");
  let editorError = $state("");
  let editorSaving = $state(false);
  let memoTextarea = $state<HTMLTextAreaElement | null>(null);

  const records = $derived(editableRecords);
  const recordMap = $derived(new Map(records.map((record) => [record.date, record])));
  const monthLabel = $derived(
    `${visibleMonth.getFullYear()}년 ${String(visibleMonth.getMonth() + 1).padStart(2, "0")}월`,
  );
  const cells = $derived(buildCalendarCells(visibleMonth, selectedDateKey, today, recordMap));

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
        "hasPt" in value &&
        "memo" in value &&
        typeof value.date === "string" &&
        typeof value.hasPt === "boolean" &&
        typeof value.memo === "string",
    );
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
        hasPt: record.hasPt,
        memo: record.memo,
      }))
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  function buildCalendarCells(
    monthDate: Date,
    currentSelectedDateKey: string | null,
    baseDate: Date,
    recordsByDate: Map<string, FitnessRecord>,
  ) {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const firstGridDate = new Date(firstDay);
    firstGridDate.setDate(firstDay.getDate() - firstDay.getDay());

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstGridDate);
      date.setDate(firstGridDate.getDate() + index);

      const key = toDateKey(date);
      const record = recordsByDate.get(key) ?? null;

      return {
        key,
        date,
        day: date.getDate(),
        inCurrentMonth: date.getMonth() === monthDate.getMonth(),
        isToday: key === toDateKey(baseDate),
        isSunday: date.getDay() === 0,
        isSaturday: date.getDay() === 6,
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
    editorHasPt = cell.record?.hasPt ?? false;
    editorMemo = cell.record?.memo ?? "";
    editorError = "";

    await tick();
    memoTextarea?.focus();
  }

  function closeEditor() {
    editorDateKey = null;
    editorHasPt = false;
    editorMemo = "";
    editorError = "";
    editorSaving = false;
  }

  async function saveEditor() {
    if (!editorDateKey || editorSaving) {
      return;
    }

    const nextRecord: FitnessRecord = {
      date: editorDateKey,
      hasPt: editorHasPt,
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
  <title>운동 캘린더</title>
</svelte:head>

<section class="fitness-page" aria-label="운동 캘린더">
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

  <div class="calendar-panel">
    {#if recordsLoading}
      <div class="records-status" role="status" aria-live="polite">
        <span class="loading-spinner"></span>
        <span>운동 기록을 불러오는 중</span>
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
          class={`calendar-cell ${cell.inCurrentMonth ? "" : "is-muted"} ${cell.isToday ? "is-today" : ""} ${cell.isSunday ? "is-red" : ""} ${cell.isSaturday ? "is-blue" : ""} ${cell.isSelected ? "is-selected" : ""}`}
          onclick={() => void openEditor(cell)}
          aria-pressed={cell.isSelected}
          aria-label={`${cell.key}${cell.record?.hasPt ? ", PT" : ""}${cell.hasMemo ? `, ${cell.record?.memo}` : ""} 편집`}
          >
            <span class="date-line">
              <span class="day-number">{cell.day}</span>
            </span>
            {#if cell.record?.hasPt}
              <span class="pt-label" aria-label="PT일">
                <span class="pt-dot"></span>
                PT
              </span>
            {/if}
            {#if cell.hasMemo}
              <small>{cell.record?.memo}</small>
            {/if}
        </button>
      {/each}
    </div>
  </div>
</section>

{#if editorDateKey}
  <button
    type="button"
    class="editor-backdrop"
    aria-label="편집 닫기"
    onclick={closeEditor}
  ></button>
  <div class="editor-wrap">
    <div class="editor-panel" role="dialog" aria-modal="true" aria-labelledby="fitness-editor-title">
      <div class="editor-head">
        <h2 id="fitness-editor-title">{editorDateKey}</h2>
        <button type="button" class="editor-close" aria-label="편집 닫기" onclick={closeEditor}>×</button>
      </div>

      <label class="pt-toggle">
        <input type="checkbox" bind:checked={editorHasPt} />
        <span>PT한 날</span>
      </label>

      <label class="editor-field">
        <span>운동 메모</span>
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
    </div>
  </div>
{/if}

<style>
  :global(body) {
    overflow-x: hidden;
  }

  .fitness-page {
    min-height: 100svh;
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    padding: 10px 8px 14px;
    color: var(--text);
  }

  .calendar-toolbar {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) 42px;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .calendar-toolbar h1 {
    margin: 0;
    overflow: hidden;
    color: var(--text-strong);
    font-size: 1.875rem;
    font-weight: 900;
    letter-spacing: 0;
    line-height: 1;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .month-button {
    width: 42px;
    height: 42px;
    border: 1px solid var(--line);
    border-radius: var(--control-radius);
    background: var(--surface);
    color: var(--text-strong);
    font-size: 28px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    box-shadow: var(--shadow-soft);
  }

  .calendar-panel {
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--panel-radius);
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  .records-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-height: 42px;
    border-bottom: 1px solid #e5e7eb;
    background: #f0fdf4;
    color: #15803d;
    font-size: 13px;
    font-weight: 900;
  }

  .records-status.is-error {
    justify-content: space-between;
    padding: 0 12px;
    background: #fef2f2;
    color: #dc2626;
  }

  .records-status button {
    border: 1px solid rgba(220, 38, 38, 0.24);
    border-radius: 999px;
    background: #fff;
    color: #dc2626;
    font: inherit;
    font-size: 12px;
    font-weight: 900;
    padding: 6px 10px;
    cursor: pointer;
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(21, 128, 61, 0.2);
    border-top-color: #16a34a;
    border-radius: 999px;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .weekdays,
  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .weekdays div {
    padding: 9px 2px;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: var(--surface-muted);
    color: var(--muted);
    font-size: 12px;
    font-weight: 900;
    text-align: center;
  }

  .weekdays div:last-child,
  .calendar-cell:nth-child(7n) {
    border-right: 0;
  }

  .calendar-cell {
    min-width: 0;
    min-height: clamp(74px, 14svh, 108px);
    padding: 7px 5px;
    border: 0;
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: var(--surface);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    text-align: left;
    cursor: pointer;
  }

  .calendar-cell:nth-last-child(-n + 7) {
    border-bottom: 0;
  }

  .calendar-cell.is-selected {
    background: var(--brand-soft);
    box-shadow: inset 0 0 0 2px var(--brand);
  }

  .calendar-cell.is-muted {
    background: var(--surface-muted);
  }

  .calendar-cell.is-muted .date-line,
  .calendar-cell.is-muted small {
    opacity: 0.34;
  }

  .date-line {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .day-number {
    color: var(--text-strong);
    font-size: 14px;
    font-weight: 900;
    line-height: 1.2;
  }

  .calendar-cell.is-today .day-number {
    color: #16a34a;
  }

  .pt-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #ef4444;
    box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.14);
  }

  .pt-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #dc2626;
    font-size: 10px;
    font-weight: 900;
    line-height: 1.15;
  }

  .calendar-cell small {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    color: #475569;
    font-size: 0.68rem;
    font-weight: 700;
    line-height: 1.35;
    white-space: pre-line;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    line-clamp: 5;
  }

  .editor-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    border: 0;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(4px);
  }

  .editor-wrap {
    position: fixed;
    inset: 0;
    z-index: 41;
    display: grid;
    place-items: end center;
    padding: 14px;
    pointer-events: none;
  }

  .editor-panel {
    display: grid;
    width: min(100%, 520px);
    max-height: calc(100svh - 28px);
    gap: 14px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: var(--panel-radius);
    background: var(--surface);
    padding: 18px;
    box-shadow: var(--shadow-float);
    pointer-events: auto;
  }

  .editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .editor-head h2 {
    margin: 0;
    color: var(--text-strong);
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 0;
  }

  .editor-close {
    width: 38px;
    height: 38px;
    border: 1px solid var(--line);
    border-radius: var(--control-radius);
    background: var(--surface-muted);
    color: var(--text-strong);
    font-size: 24px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
  }

  .pt-toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    width: fit-content;
    border-radius: 999px;
    background: #fef2f2;
    padding: 10px 14px;
    color: #dc2626;
    font-size: 14px;
    font-weight: 900;
  }

  .pt-toggle input {
    width: 18px;
    height: 18px;
    accent-color: #ef4444;
  }

  .editor-field {
    display: grid;
    gap: 8px;
  }

  .editor-field span {
    color: var(--muted);
    font-size: 13px;
    font-weight: 900;
  }

  .editor-field textarea {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: var(--control-radius);
    background: var(--surface);
    color: var(--text-strong);
    font: inherit;
    font-size: 16px;
    outline: none;
  }

  .editor-field textarea {
    min-height: 160px;
    resize: vertical;
    padding: 13px 14px;
    line-height: 1.55;
  }

  .editor-field textarea:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .editor-error {
    margin: -4px 0 0;
    color: #dc2626;
    font-size: 13px;
    font-weight: 800;
  }

  .editor-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .action-button {
    height: 48px;
    border-radius: 16px;
    border: 1px solid #dbe4ef;
    font-size: 15px;
    font-weight: 900;
    cursor: pointer;
  }

  .action-button:disabled {
    cursor: wait;
    opacity: 0.68;
  }

  .action-button.ghost {
    background: #f8fafc;
    color: #475569;
  }

  .action-button.primary {
    border-color: #0f172a;
    background: #0f172a;
    color: #fff;
  }

  .weekdays div:first-child,
  .calendar-cell.is-red .day-number {
    color: #dc2626;
  }

  .weekdays div:last-child,
  .calendar-cell.is-blue .day-number {
    color: #2563eb;
  }

  .calendar-cell.is-today .day-number {
    color: #16a34a;
  }

  @media (max-width: 380px) {
    .fitness-page {
      padding-inline: 5px;
    }

    .calendar-toolbar {
      grid-template-columns: 38px minmax(0, 1fr) 38px;
    }

    .month-button {
      width: 38px;
      height: 38px;
      border-radius: 12px;
    }

    .calendar-cell {
      min-height: clamp(68px, 13.5svh, 96px);
      padding: 6px 4px;
    }

    .calendar-cell small {
      -webkit-line-clamp: 4;
      line-clamp: 4;
    }
  }

  :global(html[data-theme="dark"]) .fitness-page {
    color: var(--text);
  }

  :global(html[data-theme="dark"]) .calendar-toolbar h1,
  :global(html[data-theme="dark"]) .month-button,
  :global(html[data-theme="dark"]) .day-number {
    color: var(--text-strong);
  }

  :global(html[data-theme="dark"]) .month-button,
  :global(html[data-theme="dark"]) .calendar-panel,
  :global(html[data-theme="dark"]) .calendar-cell,
  :global(html[data-theme="dark"]) .calendar-cell.is-muted {
    background: var(--surface);
    border-color: var(--line);
  }

  :global(html[data-theme="dark"]) .weekdays div {
    background: var(--surface-muted);
    border-color: var(--line);
    color: var(--muted);
  }

  :global(html[data-theme="dark"]) .calendar-cell small {
    color: var(--muted);
  }

  :global(html[data-theme="dark"]) .calendar-cell.is-selected {
    background: var(--brand-soft);
    box-shadow: inset 0 0 0 2px var(--brand);
  }

  :global(html[data-theme="dark"]) .records-status {
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(20, 83, 45, 0.34);
    color: #86efac;
  }

  :global(html[data-theme="dark"]) .records-status.is-error {
    background: rgba(127, 29, 29, 0.35);
    color: #fca5a5;
  }

  :global(html[data-theme="dark"]) .records-status button {
    background: #1c1917;
    border-color: rgba(252, 165, 165, 0.28);
    color: #fca5a5;
  }

  :global(html[data-theme="dark"]) .weekdays div:first-child,
  :global(html[data-theme="dark"]) .calendar-cell.is-red .day-number {
    color: #f87171;
  }

  :global(html[data-theme="dark"]) .weekdays div:last-child,
  :global(html[data-theme="dark"]) .calendar-cell.is-blue .day-number {
    color: #60a5fa;
  }

  :global(html[data-theme="dark"]) .calendar-cell.is-today .day-number {
    color: #4ade80;
  }

  :global(html[data-theme="dark"]) .editor-panel,
  :global(html[data-theme="dark"]) .editor-field textarea {
    background: var(--surface);
    border-color: var(--line);
    color: var(--text-strong);
  }

  :global(html[data-theme="dark"]) .editor-head h2,
  :global(html[data-theme="dark"]) .editor-close {
    color: var(--text-strong);
  }

  :global(html[data-theme="dark"]) .editor-close,
  :global(html[data-theme="dark"]) .action-button.ghost {
    background: var(--surface-muted);
    border-color: var(--line);
    color: var(--muted);
  }

  :global(html[data-theme="dark"]) .editor-field span {
    color: var(--muted);
  }

  :global(html[data-theme="dark"]) .pt-toggle {
    background: rgba(127, 29, 29, 0.35);
    color: #fca5a5;
  }

  :global(html[data-theme="dark"]) .action-button.primary {
    border-color: var(--brand);
    background: var(--brand);
    color: var(--on-brand);
  }
</style>
