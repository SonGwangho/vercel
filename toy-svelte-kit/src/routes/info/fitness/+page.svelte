<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";

  import type {
    DayOffItem,
    DayOffYearGroup,
    FitnessMemo,
    FitnessRecord,
    FitnessRecordSaveRequest,
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
  let draft = $state<FitnessMemo | null>(null);
  let deletingMemo = $state<FitnessMemo | null>(null);
  let loadSequence = 0;
  let editorError = $state("");
  let editorSaving = $state(false);
  let memoTextarea = $state<HTMLTextAreaElement | null>(null);
  let editorDialog = $state<HTMLDialogElement | null>(null);

  const device = $derived(page.url.searchParams.get("device"));
  const deviceMode = $derived(device === "mobile" || device === "pc" ? device : "auto");
  const recordMap = $derived(new Map(editableRecords.map((record) => [record.date, record])));
  const editorRecord = $derived(editorDateKey ? recordMap.get(editorDateKey) : undefined);
  const availabilityChanged = $derived(
    editorIsAvailable !== (editorRecord?.isAvailable ?? false) ||
    editorIsUnavailable !== (editorRecord?.isUnavailable ?? false),
  );
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

    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const weekCount = Math.ceil((firstDay.getDay() + daysInMonth) / 7);

    return Array.from({ length: weekCount * 7 }, (_, index) => {
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

  function applyRecords(records: FitnessRecord[]) {
    const syncAvailability = editorDateKey !== null && !availabilityChanged;
    editableRecords = records;
    if (syncAvailability && editorDateKey) {
      const record = recordMap.get(editorDateKey);
      editorIsAvailable = record?.isAvailable ?? false;
      editorIsUnavailable = record?.isUnavailable ?? false;
    }
  }

  async function loadFitnessRecords() {
    const sequence = ++loadSequence;
    recordsLoading = true;
    recordsError = "";

    try {
      const response = await fetch("/api/fitness");

      if (!response.ok) throw new Error();

      const data = (await response.json()) as FitnessRecordSaveResponse;
      if (sequence === loadSequence) applyRecords(data.records);
    } catch {
      if (sequence === loadSequence) recordsError = "운동 기록을 불러오지 못했습니다.";
    } finally {
      if (sequence === loadSequence) recordsLoading = false;
    }
  }

  async function openEditor(cell: CalendarCell) {
    selectedDateKey = cell.key;
    editorDateKey = cell.key;
    editorIsUnavailable = cell.record?.isUnavailable ?? false;
    editorIsAvailable = cell.record?.isAvailable ?? false;
    draft = null;
    deletingMemo = null;
    editorError = "";

    await tick();
    editorDialog?.showModal();
  }

  function closeEditor() {
    if (editorSaving) return;
    editorDialog?.close();
    editorDateKey = null;
    editorIsUnavailable = false;
    editorIsAvailable = false;
    draft = null;
    deletingMemo = null;
    editorError = "";
    editorSaving = false;
  }

  async function openMemo(memo?: FitnessMemo) {
    if (editorSaving) return;
    draft = memo ? { ...memo } : { id: crypto.randomUUID(), author: "", body: "", revision: 0 };
    editorError = "";
    await tick();
    memoTextarea?.focus();
  }

  async function confirmMemoDeletion(memo: FitnessMemo) {
    if (editorSaving) return;
    deletingMemo = { ...memo };
    editorError = "";
    await tick();
    document.getElementById("fitness-cancel-delete")?.focus();
  }

  async function backToDay(focusId?: string) {
    if (editorSaving) return;
    const deletingId = deletingMemo?.id;
    draft = null;
    deletingMemo = null;
    editorError = "";
    await tick();
    const target = deletingId
      ? document.getElementById(`fitness-delete-memo-${deletingId}`)
      : focusId && document.getElementById(`fitness-memo-${focusId}`);
    (target || document.getElementById("fitness-add-memo"))?.focus();
  }

  function dismissEditor() {
    if (deletingMemo) void backToDay();
    else if (draft) void backToDay(draft.id);
    else closeEditor();
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
      dismissEditor();
    }
  }

  async function persistChange(change: FitnessRecordSaveRequest) {
    if (editorSaving) return false;
    editorSaving = true;
    editorError = "";
    const failureMessage = change.action === "deleteMemo"
      ? "삭제하지 못했습니다. 다시 시도해 주세요."
      : "저장하지 못했습니다. 다시 시도해 주세요.";

    try {
      const response = await fetch("/api/fitness", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(change),
      });

      if (!response.ok) {
        if (response.status === 409) {
          await loadFitnessRecords();
          editorError = "메모가 변경되었습니다. 취소한 뒤 목록에서 다시 열어 주세요.";
        } else {
          editorError = failureMessage;
        }
        return false;
      }

      const data = (await response.json()) as FitnessRecordSaveResponse;
      applyRecords(data.records);
      return true;
    } catch {
      editorError = failureMessage;
      return false;
    } finally {
      editorSaving = false;
    }
  }

  async function saveAvailability() {
    if (!editorDateKey || !availabilityChanged) return;
    const saved = await persistChange({
      action: "availability", date: editorDateKey,
      isAvailable: editorIsAvailable, isUnavailable: editorIsUnavailable,
    });
    if (saved) closeEditor();
  }

  async function saveMemo() {
    if (!editorDateKey || !draft || !draft.body.trim()) return;
    const memo = { ...draft };
    const saved = await persistChange({
      action: memo.revision === 0 ? "addMemo" : "editMemo", date: editorDateKey, memo,
    });
    if (saved) await backToDay(memo.id);
  }

  async function deleteMemo() {
    if (!editorDateKey || !deletingMemo) return;
    const saved = await persistChange({
      action: "deleteMemo",
      date: editorDateKey,
      memo: { id: deletingMemo.id, revision: deletingMemo.revision },
    });
    if (saved) await backToDay();
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
          disabled={recordsLoading || Boolean(recordsError)}
          aria-pressed={cell.isSelected}
          aria-label={`${cell.key}${cell.holidayName ? `, ${cell.holidayName}` : ""}${cell.record?.isUnavailable ? ", 안 되는 날 X" : ""}${cell.record?.isAvailable ? ", 되는 날 O" : ""}${cell.hasMemo ? `, ${cell.record?.memo}` : ""} 편집`}
          >
            <span class="date-line">
              <span class="day-number">{cell.day}</span>
              {#if cell.record?.isUnavailable}
                <span class="status-label is-unavailable" aria-hidden="true">X</span>
              {:else if cell.record?.isAvailable}
                <span class="status-label is-available" aria-hidden="true">O</span>
              {/if}
            </span>
            {#if cell.holidayName}
              <small class="holiday-name">{cell.holidayName}</small>
            {/if}
            {#if cell.hasMemo}
              <span class="memo-preview">
                <small class="record-memo">{cell.record?.memo}</small>
              </span>
            {/if}
        </button>
      {/each}
    </div>
  </div>
</section>

{#if editorDateKey}
    <dialog
      bind:this={editorDialog}
      class="editor-panel"
      aria-labelledby="fitness-editor-title"
      onclick={dismissEditorFromBackdrop}
      oncancel={(event) => { event.preventDefault(); dismissEditor(); }}
    >
      <div class="editor-head">
        <h2 id="fitness-editor-title">
          {#if deletingMemo}삭제하시겠습니까?
          {:else if draft}{draft.revision === 0 ? "메모 추가" : "메모 수정"}
          {:else}{editorDateKey}{/if}
        </h2>
        <button type="button" class="editor-close" aria-label={deletingMemo ? "삭제 취소" : draft ? "메모 편집 닫기" : "날짜 닫기"} disabled={editorSaving} onclick={dismissEditor}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
      </div>

      {#if deletingMemo}
        <p class="delete-memo-preview">{deletingMemo.author ? `${deletingMemo.author} - ` : ""}{deletingMemo.body}</p>
        {#if editorError}
          <p class="editor-error" role="alert">{editorError}</p>
        {/if}
        <div class="editor-actions">
          <button id="fitness-cancel-delete" type="button" class="action-button ghost" disabled={editorSaving} onclick={dismissEditor}>취소</button>
          <button type="button" class="action-button danger" disabled={editorSaving} onclick={() => void deleteMemo()}>
            {editorSaving ? "삭제 중" : "삭제"}
          </button>
        </div>
      {:else if draft}
        <form class="memo-form" onsubmit={(event) => { event.preventDefault(); void saveMemo(); }}>
          <label class="editor-field">
            <span>작성자 (선택)</span>
            <input type="text" bind:value={draft.author} disabled={editorSaving} />
          </label>
          <label class="editor-field">
            <span>메모 내용</span>
            <textarea rows="7" required bind:this={memoTextarea} bind:value={draft.body} disabled={editorSaving}></textarea>
          </label>
          {#if editorError}
            <p class="editor-error" role="alert">{editorError}</p>
          {/if}
          <div class="editor-actions">
            <button type="button" class="action-button ghost" disabled={editorSaving} onclick={dismissEditor}>취소</button>
            <button type="submit" class="action-button primary" disabled={editorSaving || !draft.body.trim()}>
              {editorSaving ? "저장 중" : "저장"}
            </button>
          </div>
        </form>
      {:else}
      <div class="availability-options" aria-label="일정 가능 여부">
        <label class="availability-toggle is-available">
          <input
            type="checkbox"
            checked={editorIsAvailable}
            disabled={editorSaving}
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
            disabled={editorSaving}
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

      <div class="day-memos">
        <button id="fitness-add-memo" type="button" class="memo-add" disabled={editorSaving} onclick={() => void openMemo()}>메모 추가</button>
        {#if editorRecord?.memos.length}
          <ul class="memo-list" aria-label="메모 목록">
            {#each editorRecord.memos as memo (memo.id)}
              <li class="memo-item">
                <button id={`fitness-memo-${memo.id}`} type="button" class="memo-row" disabled={editorSaving} onclick={() => void openMemo(memo)}>
                  <span class="memo-text">{memo.author ? `${memo.author} - ` : ""}{memo.body}</span>
                </button>
                <button
                  id={`fitness-delete-memo-${memo.id}`}
                  type="button"
                  class="memo-delete"
                  aria-label="메모 삭제"
                  title="메모 삭제"
                  disabled={editorSaving}
                  onclick={() => void confirmMemoDeletion(memo)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                  </svg>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if editorError}
        <p class="editor-error" role="alert">{editorError}</p>
      {/if}

      <div class="editor-actions">
        <button type="button" class="action-button ghost" disabled={editorSaving} onclick={closeEditor}>취소</button>
        <button
          type="button"
          class="action-button primary"
          disabled={editorSaving || !availabilityChanged}
          onclick={() => void saveAvailability()}
        >
          {editorSaving ? "저장 중" : "일정 저장"}
        </button>
      </div>
      {/if}
    </dialog>
{/if}
</div>
</div>

<style>
  .fitness-viewport {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    width: 100%;
    height: 100svh;
    height: 100dvh;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-color: var(--line-strong) var(--bg);
  }

  .fitness-layout {
    container: fitness / inline-size;
    width: 100%;
    min-height: 0;
    margin-inline: auto;
  }

  .fitness-viewport[data-device="mobile"] .fitness-layout {
    max-width: 520px;
  }

  .fitness-viewport[data-device="pc"] .fitness-layout {
    min-width: 860px;
  }

  .fitness-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 8px;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }

  .calendar-toolbar {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
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
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: var(--panel-radius);
    background: var(--surface);
  }

  .records-status {
    display: flex;
    flex-shrink: 0;
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

  .weekdays {
    position: sticky;
    top: 0;
    z-index: 1;
    flex-shrink: 0;
  }

  .calendar-grid {
    flex: 1;
    min-height: 0;
    grid-auto-rows: minmax(44px, 1fr);
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
    gap: 3px;
    min-width: 0;
    min-height: 44px;
    overflow: hidden;
    padding: 5px 4px;
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
    gap: 2px;
    flex-wrap: wrap;
    min-height: 20px;
  }

  .day-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
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
    font-size: 0.75rem;
    font-weight: 750;
    line-height: 1.2;
  }

  .status-label.is-available { color: var(--success); }
  .status-label.is-unavailable { color: var(--danger); }

  .calendar-cell small {
    display: block;
    flex-shrink: 0;
    max-width: 100%;
    color: var(--muted);
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .memo-preview {
    flex: 1;
    min-height: 0;
    align-self: stretch;
    overflow: hidden;
  }

  .record-memo {
    max-height: 100%;
    max-height: round(down, 100%, 1lh);
    overflow: hidden;
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

  .memo-form, .day-memos { display: grid; min-width: 0; gap: 14px; }
  .memo-add, .memo-row {
    border: 0;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }
  .memo-add {
    justify-self: start;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--control-radius);
    font-weight: 650;
  }
  .memo-list { list-style: none; margin: 0; padding: 0; }
  .memo-list li { border-top: 1px solid var(--line); }
  .memo-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px;
    align-items: start;
    gap: 8px;
  }
  .memo-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: var(--control-radius);
    background: transparent;
    color: var(--danger);
    cursor: pointer;
  }
  .memo-delete svg { width: 18px; height: 18px; }
  .memo-delete:disabled { opacity: 0.68; cursor: wait; }
  .delete-memo-preview {
    max-height: 160px;
    overflow: auto;
    margin: 0;
    color: var(--muted);
    font-size: 0.875rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .memo-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: baseline;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 10px 2px;
    text-align: left;
    font-size: 0.875rem;
  }
  .memo-text { white-space: pre-wrap; overflow-wrap: anywhere; }

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

  .editor-field input,
  .editor-field textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--line-strong);
    border-radius: var(--control-radius);
    background: var(--surface);
    color: var(--text-strong);
    caret-color: var(--brand);
    font: inherit;
    font-size: 1rem;
    line-height: 1.55;
  }
  .editor-field textarea { min-height: 160px; resize: vertical; }

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
  .action-button.danger {
    border-color: var(--danger);
    background: var(--danger-soft);
    color: var(--danger);
  }

  .month-button:focus-visible,
  .today-button:focus-visible,
  .calendar-cell:focus-visible,
  .records-status button:focus-visible,
  .editor-close:focus-visible,
  .memo-add:focus-visible,
  .memo-row:focus-visible,
  .memo-delete:focus-visible,
  .editor-field input:focus-visible,
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
    .memo-add:hover,
    .memo-row:hover,
    .action-button.ghost:hover { background: var(--surface-strong); }
    .calendar-cell:hover { background: var(--brand-soft); }
    .memo-delete:hover:not(:disabled) { background: var(--danger-soft); }
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
    .fitness-page { padding: 16px 24px; }
    .calendar-toolbar { justify-content: space-between; margin-bottom: 12px; }
    .month-navigation { flex: none; grid-template-columns: 44px auto 44px; gap: 12px; }
    .today-button { padding-inline: 20px; }
    .calendar-cell { padding: 6px 8px; }
    .editor-panel { width: min(calc(100% - 48px), 560px); margin: auto; padding: 28px; }
    .editor-actions { grid-template-columns: auto auto; justify-content: end; }
    .action-button { min-width: 96px; padding-inline: 24px; }
  }

</style>
