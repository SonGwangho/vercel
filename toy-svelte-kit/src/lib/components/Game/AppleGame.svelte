<script lang="ts">
  import { onMount } from "svelte";
  import appleConfigJson from "$lib/assets/data/apple/config.json";
  import appleImageUrl from "$lib/assets/data/apple/img/apple.png";
  import { createRanking, loadRankings as loadRankingList } from "$lib";
  import { requireGameCode } from "$lib/gameCodes";
  import type { AppleGameProps, AppleBoardCell, AppleEndReason, AppleSelectionBox, ApplePointerPoint, AppleRankingItem } from "$lib";

  let { vertical = false }: AppleGameProps = $props();
  const gameMeta = requireGameCode("apple");
  const config = appleConfigJson;
  const DURATION = 120;
  const rows = $derived(vertical ? config.cols : config.rows);
  const cols = $derived(vertical ? config.rows : config.cols);
  const boardWidth = $derived(vertical ? 700 : 1142);
  const boardHeight = $derived(vertical ? 1142 : 700);
  const padding = $derived(vertical ? 28 : 50);
  const gap = $derived(vertical ? 6 : 8);
  const cellSize = $derived(Math.min((boardWidth - padding * 2 - gap * (cols - 1)) / cols, (boardHeight - padding * 2 - gap * (rows - 1)) / rows));
  const stride = $derived(cellSize + gap);
  const offsetX = $derived((boardWidth - (cellSize * cols + gap * (cols - 1))) / 2);
  const offsetY = $derived((boardHeight - (cellSize * rows + gap * (rows - 1))) / 2);
  const title = $derived(vertical ? "모바일 사과게임" : "사과게임");

  let board = $state<AppleBoardCell[]>([]);
  let selected = $state.raw(new Set<number>());
  let selectionTotal = $state(0);
  let selectionBox = $state<AppleSelectionBox | null>(null);
  let score = $state(0);
  let remaining = $state(config.rows * config.cols);
  let timeLeft = $state(DURATION);
  let started = $state(false);
  let gameOver = $state(false);
  let endReason = $state<AppleEndReason>(null);
  let boardElement = $state<HTMLDivElement | null>(null);
  let rankings = $state<AppleRankingItem[]>([]);
  let rankingLoading = $state(true);
  let rankingError = $state("");
  let userName = $state("");
  let submitting = $state(false);
  let submitted = $state(false);
  let submitError = $state("");

  let boardRect: DOMRect | null = null;
  let startPoint: ApplePointerPoint | null = null;
  let currentPoint: ApplePointerPoint | null = null;
  let activePointer: number | null = null;
  let selectionFrame: number | null = null;
  let selectedRegion = "";
  let deadline = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const removed = $derived(rows * cols - remaining);
  const timeLabel = $derived(`${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`);

  function stopTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  function cancelSelection() {
    if (selectionFrame !== null) cancelAnimationFrame(selectionFrame);
    selectionFrame = null;
    if (activePointer !== null && boardElement?.hasPointerCapture(activePointer)) {
      boardElement.releasePointerCapture(activePointer);
    }
    activePointer = null;
    startPoint = null;
    currentPoint = null;
    selectedRegion = "";
    selected = new Set();
    selectionTotal = 0;
    selectionBox = null;
  }

  function updateTimer() {
    if (!started || gameOver) return;
    timeLeft = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
    if (timeLeft === 0) {
      gameOver = true;
      endReason = "timeout";
      stopTimer();
      cancelSelection();
    }
  }

  function createBoard() {
    board = Array.from({ length: rows * cols }, (_, id) => {
      const row = Math.floor(id / cols);
      const col = id % cols;
      return {
        id, row, col, removed: false,
        value: Math.floor(Math.random() * (config.maxValue - config.minValue + 1)) + config.minValue,
        style: `left:${((offsetX + col * stride) / boardWidth) * 100}%;top:${((offsetY + row * stride) / boardHeight) * 100}%;width:${(cellSize / boardWidth) * 100}%;height:${(cellSize / boardHeight) * 100}%;`
      };
    });
    remaining = rows * cols;
  }

  function startGame() {
    if (submitting) return;
    stopTimer();
    cancelSelection();
    createBoard();
    score = 0;
    timeLeft = DURATION;
    gameOver = false;
    endReason = null;
    started = true;
    submitted = false;
    userName = "";
    submitError = "";
    deadline = performance.now() + DURATION * 1000;
    timer = setInterval(updateTimer, 1000);
  }

  function updateSelection() {
    selectionFrame = null;
    if (!startPoint || !currentPoint || !boardRect) return;
    const left = Math.min(startPoint.x, currentPoint.x);
    const top = Math.min(startPoint.y, currentPoint.y);
    const right = Math.max(startPoint.x, currentPoint.x);
    const bottom = Math.max(startPoint.y, currentPoint.y);
    selectionBox = { left, top, width: right - left, height: bottom - top };

    // The regular grid gives the intersected range directly, without scanning all 170 cells.
    const scaleX = boardWidth / boardRect.width;
    const scaleY = boardHeight / boardRect.height;
    const minCol = Math.max(0, Math.floor((left * scaleX - offsetX - cellSize) / stride) + 1);
    const maxCol = Math.min(cols - 1, Math.ceil((right * scaleX - offsetX) / stride) - 1);
    const minRow = Math.max(0, Math.floor((top * scaleY - offsetY - cellSize) / stride) + 1);
    const maxRow = Math.min(rows - 1, Math.ceil((bottom * scaleY - offsetY) / stride) - 1);
    const region = `${minRow}:${maxRow}:${minCol}:${maxCol}`;
    if (region === selectedRegion) return;
    selectedRegion = region;
    const next = new Set<number>();
    let total = 0;
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const cell = board[row * cols + col];
        if (!cell.removed) { next.add(cell.id); total += cell.value; }
      }
    }
    selected = next;
    selectionTotal = total;
  }

  function updatePoint(event: PointerEvent) {
    if (!boardRect) return;
    currentPoint = {
      x: Math.min(boardRect.width, Math.max(0, event.clientX - boardRect.left)),
      y: Math.min(boardRect.height, Math.max(0, event.clientY - boardRect.top))
    };
  }

  function pointerDown(event: PointerEvent) {
    if (!started || gameOver || !boardElement || activePointer !== null || event.button !== 0) return;
    updateTimer();
    if (gameOver) return;
    event.preventDefault();
    boardRect = boardElement.getBoundingClientRect();
    updatePoint(event);
    startPoint = currentPoint;
    activePointer = event.pointerId;
    boardElement.setPointerCapture(event.pointerId);
    updateSelection();
  }

  function pointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    updatePoint(event);
    if (selectionFrame === null) selectionFrame = requestAnimationFrame(updateSelection);
  }

  function pointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointer) return;
    updateTimer();
    if (gameOver) return;
    updatePoint(event);
    if (selectionFrame !== null) cancelAnimationFrame(selectionFrame);
    updateSelection();
    if (selected.size > 0 && selectionTotal === config.targetSum) {
      for (const id of selected) board[id].removed = true;
      remaining -= selected.size;
      score += selected.size * 10;
      if (remaining === 0) {
        score += timeLeft * 10;
        gameOver = true;
        endReason = "clear";
        stopTimer();
      }
    }
    cancelSelection();
  }

  async function loadRankings() {
    rankingLoading = true;
    rankingError = "";
    try {
      const data = await loadRankingList(gameMeta.gameCode, 10);
      rankings = data.rankings;
    } catch { rankingError = "랭킹을 불러오지 못했습니다."; }
    finally { rankingLoading = false; }
  }

  async function submitScore() {
    if (!userName.trim() || submitting || submitted || !gameOver) return;
    submitting = true;
    submitError = "";
    try {
      await createRanking({ gameCode: gameMeta.gameCode, gameName: gameMeta.gameName, userName: userName.trim(), score });
      submitted = true;
      await loadRankings();
    } catch { submitError = "점수 등록에 실패했습니다. 다시 시도해 주세요."; }
    finally { submitting = false; }
  }

  $effect(() => {
    if (!boardElement) return;
    const observer = new ResizeObserver(() => { boardRect = null; cancelSelection(); });
    observer.observe(boardElement);
    return () => observer.disconnect();
  });

  onMount(() => {
    createBoard();
    void loadRankings();
    const onVisibility = () => { cancelSelection(); updateTimer(); };
    window.addEventListener("blur", cancelSelection);
    window.addEventListener("scroll", cancelSelection, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopTimer();
      cancelSelection();
      window.removeEventListener("blur", cancelSelection);
      window.removeEventListener("scroll", cancelSelection, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });
</script>

<svelte:head><title>{title} · 장난감 웹</title></svelte:head>

<section class="apple-game" class:vertical>
  <header class="game-heading">
    <div><h1>{title}</h1><p>사과를 드래그해 합계 {config.targetSum}을 만드세요. 제한 시간은 2분입니다.</p></div>
    <button class="game-action secondary" type="button" onclick={startGame} disabled={submitting}>{started ? "새 게임" : "게임 시작"}</button>
  </header>
  <div class="game-layout">
    <div class="arena-card">
      <dl class="status-bar">
        <div class:urgent={timeLeft <= 20 && started && !gameOver}><dt>남은 시간</dt><dd>{timeLabel}</dd></div>
        <div><dt>점수</dt><dd>{score.toLocaleString("ko-KR")}</dd></div>
        <div><dt>남은 사과</dt><dd>{remaining}</dd></div>
        <div><dt>제거한 사과</dt><dd>{removed}</dd></div>
      </dl>
      <div class="board" bind:this={boardElement} style={`aspect-ratio:${boardWidth}/${boardHeight};--apple-image:url('${appleImageUrl}');`} onpointerdown={pointerDown} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={cancelSelection} onlostpointercapture={cancelSelection} role="presentation">
        {#each board as cell (cell.id)}
          <div class="apple-cell" class:selected={selected.has(cell.id)} class:removed={cell.removed} style={cell.style}>
            {#if !cell.removed}<div class="apple-face"><span>{cell.value}</span></div>{/if}
          </div>
        {/each}
        {#if selectionBox}<div class="selection-box" class:valid={selectionTotal === config.targetSum} style={`transform:translate(${selectionBox.left}px,${selectionBox.top}px);width:${selectionBox.width}px;height:${selectionBox.height}px;`}></div>{/if}
        {#if !started || gameOver}
          <div class="overlay">
            <div class="overlay-card">
              <h2>{gameOver ? (endReason === "clear" ? "모두 제거했어요!" : "시간 종료") : `합계 ${config.targetSum}을 만들어 보세요`}</h2>
              <p>{gameOver ? "수고했어요. 기록을 남기고 다시 도전해 보세요." : "사과를 네모로 묶어 합계를 맞추면 사과 하나당 10점을 얻어요."}</p>
              {#if gameOver}
                <strong class="final-score">{score.toLocaleString("ko-KR")}<span>점</span></strong>
                <form class="submit-row" onsubmit={(event) => { event.preventDefault(); void submitScore(); }}>
                  <label><span>기록에 남길 이름</span><input bind:value={userName} maxlength="12" placeholder="이름 입력" disabled={submitted || submitting} /></label>
                  <button type="submit" class="game-action" disabled={!userName.trim() || submitted || submitting}>{submitted ? "등록 완료" : submitting ? "등록 중" : "점수 등록"}</button>
                </form>
                {#if submitError}<p class="error" role="alert">{submitError}</p>{/if}
              {/if}
              <button type="button" class="game-action" class:secondary={gameOver} onclick={startGame} disabled={submitting}>{gameOver ? "다시 시작" : "게임 시작"}</button>
            </div>
          </div>
        {/if}
      </div>
      <div class="board-guide"><span>드래그해서 선택 · 손을 떼면 확인</span><span class:valid={selectionTotal === config.targetSum}>선택 합계 <strong>{selectionTotal}</strong> / {config.targetSum}</span></div>
    </div>
    <aside class="ranking-card" aria-label="사과게임 랭킹">
      <header><h2>게임 랭킹</h2><span>상위 10명</span></header>
      {#if rankingLoading}<p class="ranking-message" role="status">기록을 불러오는 중입니다.</p>
      {:else if rankingError}<div class="ranking-error" role="alert"><p>{rankingError}</p><button type="button" class="game-action secondary" onclick={() => void loadRankings()}>다시 시도</button></div>
      {:else if rankings.length === 0}<p class="ranking-message">아직 등록된 점수가 없어요.<br />첫 기록에 도전해 보세요.</p>
      {:else}<ol class="ranking-list">{#each rankings as ranking, index}<li><span class="rank">{ranking.rank ?? index + 1}</span><span class="name" title={ranking.userName}>{ranking.userName || "익명"}</span><strong>{ranking.score.toLocaleString("ko-KR")}</strong></li>{/each}</ol>{/if}
    </aside>
  </div>
</section>

<style>
  .game-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 16px; align-items: start; }
  .arena-card, .ranking-card { min-width: 0; padding: 24px; border-radius: var(--panel-radius); background: var(--surface); }
  .status-bar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 0 0 20px; }
  .status-bar dt { color: var(--muted); font-size: 12px; }
  .status-bar dd { margin: 4px 0 0; color: var(--text-strong); font-size: 24px; font-weight: 500; font-variant-numeric: tabular-nums; line-height: 1.4; }
  .status-bar .urgent dd { color: var(--danger); }
  .board { position: relative; width: 100%; background: var(--surface-muted); border-radius: 12px; overflow: hidden; touch-action: none; user-select: none; contain: layout paint; }
  .apple-cell { position: absolute; border-radius: 5px; pointer-events: none; }
  .apple-face { display: grid; place-items: center; width: 100%; height: 100%; background-image: var(--apple-image); background-position: center; background-repeat: no-repeat; background-size: contain; }
  .apple-face span { color: white; font-size: clamp(9px, 1.4vw, 17px); font-weight: 750; text-shadow: 0 1px 2px #7e1820; line-height: 1; }
  .apple-cell.selected { background: var(--brand-soft); outline: 2px solid var(--brand-strong); }
  .selection-box { position: absolute; top: 0; left: 0; border: 2px solid var(--brand-strong); background: color-mix(in srgb, var(--brand) 12%, transparent); border-radius: 4px; pointer-events: none; }
  .selection-box.valid { border-color: var(--success); background: color-mix(in srgb, var(--success) 12%, transparent); }
  .board-guide { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .board-guide strong { margin-inline: 4px; color: var(--text); }
  .board-guide .valid, .board-guide .valid strong { color: var(--success); }
  .overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--bg) 86%, transparent); }
  .overlay-card { display: grid; gap: 14px; width: min(100%, 360px); max-height: 100%; overflow-y: auto; padding: 24px; border-radius: 12px; background: var(--surface); text-align: center; }
  .overlay-card h2 { margin: 0; font-size: 20px; line-height: 1.4; }
  .overlay-card p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
  .final-score { color: var(--brand-strong); font-size: 32px; font-variant-numeric: tabular-nums; font-weight: 500; }
  .final-score > span { font-size: 14px; margin-left: 6px; }
  .submit-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; text-align: left; }
  .submit-row label { min-width: 0; }
  .submit-row label > span { display: block; margin-bottom: 6px; color: var(--muted); font-size: 12px; }
  .submit-row input { width: 100%; min-height: 44px; min-width: 0; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: var(--control-radius); background: var(--surface-muted); color: var(--text); }
  .overlay-card .error { color: var(--danger); }
  .ranking-card header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
  .ranking-card h2 { margin: 0; font-size: 16px; font-weight: 650; }
  .ranking-card header > span { color: var(--muted); font-size: 11px; }
  .ranking-message, .ranking-error { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.8; }
  .ranking-error p { margin: 0 0 12px; }
  .ranking-list { list-style: none; padding: 0; margin: 0; }
  .ranking-list li { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; align-items: center; min-height: 44px; font-size: 13px; }
  .rank { color: var(--muted); font-variant-numeric: tabular-nums; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ranking-list strong { font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; }
  .ranking-list li:first-child .rank, .ranking-list li:first-child strong { color: var(--brand-strong); }
  .vertical .arena-card { width: min(100%, 490px); margin-inline: auto; }
  .vertical .game-layout { grid-template-columns: minmax(0, 1fr) 250px; }
  @media (max-width: 1100px) {
    .game-layout { grid-template-columns: 1fr; }
    .vertical .game-layout { grid-template-columns: minmax(0, 1fr) 230px; }
  }
  @media (max-width: 720px) {
    .arena-card, .ranking-card { padding: 16px; }
    .status-bar { gap: 10px; margin-bottom: 16px; }
    .status-bar dd { font-size: 20px; }
    .status-bar dt { font-size: 11px; }
    .board-guide { flex-wrap: wrap; font-size: 11px; }
    .vertical .game-layout { grid-template-columns: 1fr; }
    .vertical .apple-face span { font-size: 15px; }
    .overlay-card { padding: 16px; gap: 10px; }
    .overlay-card h2 { font-size: 17px; }
    .overlay-card p { font-size: 12px; }
    .submit-row { grid-template-columns: 1fr; }
  }
</style>
