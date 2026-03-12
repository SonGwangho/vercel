<script lang="ts">
  import { onMount } from "svelte";
  import appleConfigJson from "$lib/assets/data/apple/config.json";
  import appleImageUrl from "$lib/assets/data/apple/img/apple.png";
  import type {
    AppleGameCell,
    AppleGameConfig,
    AppleRankingItem,
    AppleScoreRequest,
  } from "$lib";

  type Coord = {
    row: number;
    col: number;
  };

  type Board = (AppleGameCell | null)[][];
  type SelectionBox = {
    left: number;
    top: number;
    width: number;
    height: number;
  };

  const GAME_NAME = "사과게임";
  const GAME_CODE = 300;
  const BOARD_WIDTH = 1142;
  const BOARD_HEIGHT = 700;
  const BOARD_PADDING = 50;
  const TIME_LIMIT_SECONDS = 120;
  const config = appleConfigJson as AppleGameConfig;
  const DIRECTIONS = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  let board = $state<Board>([]);
  let selectedCells = $state<Coord[]>([]);
  let score = $state(0);
  let removedAppleCount = $state(0);
  let gameOver = $state(false);
  let isSelecting = $state(false);
  let userName = $state("");
  let rankings = $state<AppleRankingItem[]>([]);
  let isRankingLoading = $state(false);
  let rankingError = $state("");
  let isSubmitting = $state(false);
  let submitMessage = $state("");
  let timeLeft = $state(TIME_LIMIT_SECONDS);
  let endReason = $state<"playing" | "timeout" | "cleared" | "stuck">("playing");
  let clearBonusAwarded = $state(false);
  let timerStarted = $state(false);
  let selectionBox = $state<SelectionBox | null>(null);

  let nextCellId = 1;
  let timerId: number | null = null;
  let lastPointerClient = { x: 0, y: 0 };
  let selectionStartClient = { x: 0, y: 0 };

  const selectionSum = $derived(
    selectedCells.reduce((total, coord) => total + (board[coord.row]?.[coord.col]?.value ?? 0), 0),
  );
  const selectionValues = $derived(
    selectedCells
      .map((coord) => board[coord.row]?.[coord.col]?.value)
      .filter((value): value is number => typeof value === "number"),
  );
  const remainingAppleCount = $derived(
    board.reduce(
      (total, row) => total + row.reduce((rowTotal, cell) => rowTotal + (cell ? 1 : 0), 0),
      0,
    ),
  );
  const boardHasMoves = $derived(findHintInBoard(board) !== null);
  const timeLabel = $derived(`${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`);

  function randomValue() {
    return (
      Math.floor(Math.random() * (config.maxValue - config.minValue + 1)) + config.minValue
    );
  }

  function createCell(): AppleGameCell {
    return {
      id: nextCellId++,
      value: randomValue(),
    };
  }

  function createBoard(): Board {
    return Array.from({ length: config.rows }, () =>
      Array.from({ length: config.cols }, () => createCell()),
    );
  }

  function collapseBoard(source: Board): Board {
    return source.map((row) => [...row]);
  }

  function findHintInBoard(source: Board): Coord[] | null {
    const visited = new Set<string>();

    function dfs(coord: Coord, sum: number, path: Coord[]): Coord[] | null {
      const cell = source[coord.row]?.[coord.col];
      if (!cell) {
        return null;
      }

      const nextSum = sum + cell.value;
      if (nextSum > config.targetSum) {
        return null;
      }

      const nextPath = [...path, coord];
      if (nextSum === config.targetSum) {
        return nextPath;
      }

      visited.add(`${coord.row}:${coord.col}`);

      for (const direction of DIRECTIONS) {
        const nextCoord = { row: coord.row + direction.row, col: coord.col + direction.col };
        const nextCell = source[nextCoord.row]?.[nextCoord.col];
        const key = `${nextCoord.row}:${nextCoord.col}`;

        if (!nextCell || visited.has(key)) {
          continue;
        }

        const result = dfs(nextCoord, nextSum, nextPath);
        if (result) {
          return result;
        }
      }

      visited.delete(`${coord.row}:${coord.col}`);
      return null;
    }

    for (let row = 0; row < config.rows; row += 1) {
      for (let col = 0; col < config.cols; col += 1) {
        visited.clear();
        const result = dfs({ row, col }, 0, []);
        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  function normalizeRankingItem(item: unknown, index: number): AppleRankingItem | null {
    if (!item || typeof item !== "object") {
      return null;
    }

    const candidate = item as Record<string, unknown>;
    const userNameValue = candidate.userName;
    const scoreValue = candidate.score;
    const rankValue = candidate.rank ?? candidate.ranking;

    if (typeof userNameValue !== "string") {
      return null;
    }

    const parsedScore =
      typeof scoreValue === "number"
        ? scoreValue
        : typeof scoreValue === "string"
          ? Number(scoreValue)
          : Number.NaN;

    if (!Number.isFinite(parsedScore)) {
      return null;
    }

    return {
      rank:
        typeof rankValue === "number"
          ? rankValue
          : typeof rankValue === "string" && Number.isFinite(Number(rankValue))
            ? Number(rankValue)
            : index + 1,
      userName: userNameValue,
      score: parsedScore,
      gameName: typeof candidate.gameName === "string" ? candidate.gameName : undefined,
    };
  }

  function normalizeRankingPayload(payload: unknown) {
    if (Array.isArray(payload)) {
      return payload
        .map((item, index) => normalizeRankingItem(item, index))
        .filter((item): item is AppleRankingItem => item !== null);
    }

    if (!payload || typeof payload !== "object") {
      return [];
    }

    const candidate = payload as Record<string, unknown>;
    const sources = [
      candidate.rankingData,
      candidate.rankings,
      candidate.ranking,
      candidate.scores,
      candidate.items,
      candidate.data,
    ];
    const list = sources.find(Array.isArray);

    if (!Array.isArray(list)) {
      return [];
    }

    return list
      .map((item, index) => normalizeRankingItem(item, index))
      .filter((item): item is AppleRankingItem => item !== null);
  }

  async function fetchRanking() {
    isRankingLoading = true;
    rankingError = "";

    try {
      const response = await fetch(`/api/getRanking?gameCode=${GAME_CODE}`);
      if (!response.ok) {
        throw new Error(`ranking fetch failed: ${response.status}`);
      }

      rankings = normalizeRankingPayload(await response.json())
        .sort((a, b) => a.rank - b.rank || b.score - a.score)
        .slice(0, 10);
    } catch (error) {
      rankings = [];
      rankingError = "랭킹을 불러오지 못했습니다.";
      console.error(error);
    } finally {
      isRankingLoading = false;
    }
  }

  async function submitScore() {
    if (!gameOver || !userName.trim() || isSubmitting) {
      return;
    }

    isSubmitting = true;
    submitMessage = "";

    const payload: AppleScoreRequest = {
      userName: userName.trim(),
      gameName: GAME_NAME,
      gameCode: GAME_CODE,
      score,
    };

    try {
      const response = await fetch("/api/postScore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`submit failed: ${response.status}`);
      }

      await fetchRanking();
      submitMessage = "점수가 랭킹에 등록되었습니다.";
    } catch (error) {
      submitMessage = "점수 등록에 실패했습니다.";
      console.error(error);
    } finally {
      isSubmitting = false;
    }
  }

  function refreshGameState(nextBoard: Board) {
    board = nextBoard;
    const hasMoves = findHintInBoard(nextBoard) !== null;
    const remainingCount = nextBoard.reduce(
      (total, row) => total + row.reduce((rowTotal, cell) => rowTotal + (cell ? 1 : 0), 0),
      0,
    );

    if (remainingCount === 0) {
      if (!clearBonusAwarded) {
        score += timeLeft * 10;
        clearBonusAwarded = true;
      }
      endReason = "cleared";
      gameOver = true;
      stopTimer();
      return;
    }

    if (!hasMoves) {
      endReason = "stuck";
      gameOver = true;
      stopTimer();
      return;
    }

    endReason = "playing";
    gameOver = false;
  }

  function stopTimer() {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    if (timerStarted) {
      return;
    }

    timerStarted = true;
    stopTimer();
    timerId = window.setInterval(() => {
      if (gameOver) {
        stopTimer();
        return;
      }

      if (timeLeft <= 1) {
        timeLeft = 0;
        endReason = "timeout";
        gameOver = true;
        stopTimer();
        return;
      }

      timeLeft -= 1;
    }, 1000);
  }

  function resetGame() {
    stopTimer();
    nextCellId = 1;
    selectedCells = [];
    score = 0;
    removedAppleCount = 0;
    isSelecting = false;
    userName = "";
    submitMessage = "";
    timeLeft = TIME_LIMIT_SECONDS;
    endReason = "playing";
    clearBonusAwarded = false;
    timerStarted = false;
    selectionBox = null;
    refreshGameState(createBoard());
  }

  function updateSelectionFromBox(boardElement: HTMLElement, clientX: number, clientY: number) {
    const boardRect = boardElement.getBoundingClientRect();
    const left = Math.max(Math.min(selectionStartClient.x, clientX), boardRect.left);
    const right = Math.min(Math.max(selectionStartClient.x, clientX), boardRect.right);
    const top = Math.max(Math.min(selectionStartClient.y, clientY), boardRect.top);
    const bottom = Math.min(Math.max(selectionStartClient.y, clientY), boardRect.bottom);

    selectionBox = {
      left: left - boardRect.left,
      top: top - boardRect.top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    };

    const nextSelected: Coord[] = [];
    const cells = boardElement.querySelectorAll<HTMLElement>("[data-row][data-col]");

    cells.forEach((cell) => {
      const cellRect = cell.getBoundingClientRect();
      const centerX = cellRect.left + cellRect.width / 2;
      const centerY = cellRect.top + cellRect.height / 2;
      const withinX = centerX >= left && centerX <= right;
      const withinY = centerY >= top && centerY <= bottom;

      if (!withinX || !withinY) {
        return;
      }

      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      if (!Number.isInteger(row) || !Number.isInteger(col)) {
        return;
      }

      if (board[row]?.[col]) {
        nextSelected.push({ row, col });
      }
    });

    selectedCells = nextSelected;
  }

  function finishSelection() {
    if (!selectedCells.length) {
      isSelecting = false;
      selectionBox = null;
      return;
    }

    if (selectionSum === config.targetSum) {
      if (!timerStarted) {
        startTimer();
      }

      const removed = new Set(selectedCells.map((coord) => `${coord.row}:${coord.col}`));
      const nextBoard = board.map((row, rowIndex) =>
        row.map((cell, colIndex) => (removed.has(`${rowIndex}:${colIndex}`) ? null : cell)),
      );
      const removedCount = selectedCells.length;

      score += removedCount * 10;
      removedAppleCount += removedCount;
      refreshGameState(collapseBoard(nextBoard));
    }

    selectedCells = [];
    isSelecting = false;
    selectionBox = null;
  }

  function onBoardPointerDown(event: PointerEvent) {
    lastPointerClient = { x: event.clientX, y: event.clientY };
    if (gameOver) {
      return;
    }

    event.preventDefault();

    const boardElement = event.currentTarget as HTMLElement;
    const boardRect = boardElement.getBoundingClientRect();

    isSelecting = true;
    selectedCells = [];
    selectionStartClient = {
      x: Math.max(boardRect.left, Math.min(event.clientX, boardRect.right)),
      y: Math.max(boardRect.top, Math.min(event.clientY, boardRect.bottom)),
    };
    selectionBox = {
      left: selectionStartClient.x - boardRect.left,
      top: selectionStartClient.y - boardRect.top,
      width: 0,
      height: 0,
    };
    boardElement.setPointerCapture(event.pointerId);
  }

  function onBoardPointerMove(event: PointerEvent) {
    lastPointerClient = { x: event.clientX, y: event.clientY };
    if (!isSelecting) {
      return;
    }

    event.preventDefault();

    updateSelectionFromBox(event.currentTarget as HTMLElement, event.clientX, event.clientY);
  }

  function onBoardPointerUp(event: PointerEvent) {
    lastPointerClient = { x: event.clientX, y: event.clientY };
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    }

    finishSelection();
  }

  function isSelected(row: number, col: number) {
    return selectedCells.some((coord) => coord.row === row && coord.col === col);
  }

  onMount(() => {
    resetGame();
    fetchRanking();

    const handleScroll = () => {
      if (!isSelecting) {
        return;
      }

      const boardElement = document.querySelector<HTMLElement>(".board");
      if (!boardElement) {
        return;
      }

      updateSelectionFromBox(boardElement, lastPointerClient.x, lastPointerClient.y);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      stopTimer();
      window.removeEventListener("scroll", handleScroll);
    };
  });
</script>

<svelte:head>
  <title>사과게임</title>
</svelte:head>

<section class="apple-page">
  <article class="hero">
    <h1>사과게임</h1>
  </article>

  <div class="game-layout">
    <article class="arena-card">
      <div class="status-bar">
        <div class="status-item">
          <span>남은 시간</span>
          <strong>{timeLabel}</strong>
        </div>
        <div class="status-item">
          <span>점수</span>
          <strong>{score}</strong>
        </div>
        <div class="status-item">
          <span>남은 사과</span>
          <strong>{remainingAppleCount}</strong>
        </div>
        <div class="status-item">
          <span>제거한 사과</span>
          <strong>{removedAppleCount}</strong>
        </div>
      </div>

      <div class="board-frame">
        <div
          class="board"
          role="application"
          aria-label="사과게임 보드"
          onpointerdown={onBoardPointerDown}
          onpointermove={onBoardPointerMove}
          onpointerup={onBoardPointerUp}
          onpointercancel={finishSelection}
        >
          {#each board as row, rowIndex}
            {#each row as cell, colIndex}
              <div class="cell-slot">
                {#if cell}
                  <button
                    type="button"
                    class:selected={isSelected(rowIndex, colIndex)}
                    class="apple-cell"
                    data-row={rowIndex}
                    data-col={colIndex}
                    style={`background-image:linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.08)), url(${appleImageUrl});`}
                    aria-label={`${rowIndex + 1}행 ${colIndex + 1}열 ${cell.value}`}
                  >
                    <span>{cell.value}</span>
                  </button>
                {:else}
                  <div class="empty-cell" aria-hidden="true"></div>
                {/if}
              </div>
            {/each}
          {/each}

          {#if selectionBox}
            <div
              class="selection-box"
              style={`left:${selectionBox.left}px;top:${selectionBox.top}px;width:${selectionBox.width}px;height:${selectionBox.height}px;`}
            ></div>
          {/if}

          {#if gameOver}
            <div class="overlay">
              <div class="overlay-panel">
                <h2>
                  {#if endReason === "cleared"}
                    모든 사과를 제거하셨습니다.
                  {:else if endReason === "timeout"}
                    시간이 종료되었습니다.
                  {:else}
                    게임이 종료되었습니다.
                  {/if}
                </h2>
                <p>
                  {#if endReason === "cleared"}
                    남은 시간 보너스 {timeLeft * 10}점이 추가되었습니다.
                  {:else if endReason === "timeout"}
                    2분 제한 시간이 끝나 패배하셨습니다.
                  {:else}
                    더 이상 합이 10이 되는 조합이 없습니다.
                  {/if}
                </p>
                <p>최종 점수는 {score}점입니다.</p>

                <label class="name-field">
                  <span>이름</span>
                  <input bind:value={userName} maxlength="20" placeholder="userName" />
                </label>

                <button
                  type="button"
                  class="submit-btn"
                  onclick={submitScore}
                  disabled={!userName.trim() || isSubmitting}
                >
                  {isSubmitting ? "등록 중입니다" : "점수 등록"}
                </button>

                {#if submitMessage}
                  <p class="submit-message">{submitMessage}</p>
                {/if}

                <button type="button" class="ghost-btn" onclick={resetGame}>새 게임</button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </article>

    <aside class="ranking-card">
      <div class="ranking-head">
        <div>
          <p class="ranking-label">Server Ranking</p>
          <h2>상위 10명</h2>
        </div>
        <button type="button" class="ghost-btn" onclick={fetchRanking}>새로고침</button>
      </div>

      {#if isRankingLoading}
        <p class="ranking-empty">랭킹을 불러오는 중입니다.</p>
      {:else if rankingError}
        <p class="ranking-empty">{rankingError}</p>
      {:else if !rankings.length}
        <p class="ranking-empty">등록된 기록이 없습니다.</p>
      {:else}
        <ol class="ranking-list">
          {#each rankings as ranking}
            <li>
              <span class="rank-no">#{ranking.rank}</span>
              <div class="rank-body">
                <strong>{ranking.userName}</strong>
                <span>{ranking.score}점</span>
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </aside>
  </div>
</section>

<style>
  .apple-page {
    display: grid;
    gap: 12px;
    color: #1f2937;
  }

  .hero {
    padding: 10px 4px 2px;
  }

  .hero h1 {
    margin: 0;
    font-size: clamp(24px, 3vw, 32px);
    line-height: 0.98;
    letter-spacing: -0.03em;
  }

  .game-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 12px;
    align-items: start;
  }

  .arena-card,
  .ranking-card {
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    border: 1px solid #e5e7eb;
    border-radius: 22px;
    padding: 12px;
    box-shadow: 0 16px 30px rgba(15, 23, 42, 0.06);
  }

  .status-bar {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 12px;
  }

  .status-item {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    background: #ffffff;
  }

  .status-item span,
  .ranking-label {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
  }

  .status-item strong {
    font-size: 16px;
    color: #111827;
  }

  .board-frame {
    width: 100%;
  }

  .board {
    position: relative;
    display: grid;
    grid-template-columns: repeat(17, minmax(0, 1fr));
    grid-template-rows: repeat(10, minmax(0, 1fr));
    gap: 8px;
    width: min(100%, 1142px);
    aspect-ratio: 1142 / 700;
    min-height: 0;
    padding: clamp(18px, 4vw, 50px);
    box-sizing: border-box;
    border-radius: 20px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    user-select: none;
    -webkit-user-select: none;
  }

  .cell-slot {
    min-width: 0;
    min-height: 0;
  }

  .apple-cell,
  .empty-cell {
    width: 100%;
    height: 100%;
    border-radius: 18px;
  }

  .apple-cell {
    border: 1px solid rgba(185, 28, 28, 0.18);
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    color: #ffffff;
    font-size: clamp(15px, 1.1vw, 22px);
    font-weight: 800;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    box-shadow: 0 10px 20px rgba(153, 27, 27, 0.16);
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    transition:
      transform 0.12s ease,
      box-shadow 0.12s ease;
  }

  .apple-cell.selected {
    transform: translateY(-2px);
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.92),
      0 0 0 6px rgba(239, 68, 68, 0.46);
  }

  .empty-cell {
    border: 1px dashed rgba(148, 163, 184, 0.35);
    background: rgba(255, 255, 255, 0.16);
    user-select: none;
    -webkit-user-select: none;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 20px;
    background: rgba(15, 23, 42, 0.36);
    backdrop-filter: blur(4px);
  }

  .selection-box {
    position: absolute;
    border: 2px solid rgba(37, 99, 235, 0.9);
    background: rgba(59, 130, 246, 0.18);
    border-radius: 12px;
    pointer-events: none;
    z-index: 2;
  }

  .overlay-panel {
    width: min(360px, calc(100% - 32px));
    display: grid;
    gap: 10px;
    padding: 18px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.96);
    color: #111827;
  }

  .overlay-panel h2,
  .overlay-panel p,
  .ranking-head h2 {
    margin: 0;
  }

  .name-field {
    display: grid;
    gap: 6px;
    font-size: 14px;
    font-weight: 700;
  }

  .name-field span {
    color: #475569;
  }

  .name-field input {
    height: 40px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 0 12px;
    font: inherit;
    background: #ffffff;
  }

  .submit-btn,
  .ghost-btn {
    height: 40px;
    border: none;
    border-radius: 999px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .submit-btn {
    color: #ffffff;
    background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  }

  .ghost-btn {
    padding: 0 14px;
    color: #1e293b;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
  }

  .submit-btn:disabled,
  .ghost-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .submit-message,
  .ranking-empty {
    margin: 0;
    color: #475569;
    font-size: 14px;
    line-height: 1.5;
  }

  .ranking-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }

  .ranking-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .ranking-list li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    border: 1px solid #e2e8f0;
  }

  .rank-no {
    min-width: 42px;
    text-align: center;
    padding: 6px 8px;
    border-radius: 999px;
    background: linear-gradient(135deg, #991b1b 0%, #b91c1c 100%);
    color: #ffffff;
    font-weight: 700;
  }

  .rank-body {
    display: grid;
    gap: 4px;
  }

  .rank-body strong {
    font-size: 14px;
  }

  .rank-body span {
    color: #475569;
    font-size: 13px;
  }

  @media (max-width: 1400px) {
    .status-bar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 980px) {
    .game-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .arena-card,
    .ranking-card {
      padding: 12px;
      border-radius: 16px;
    }

    .status-bar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .board {
      gap: 4px;
    }
  }

  :global(html[data-theme="dark"]) .apple-page {
    color: #e5eefc;
  }

  :global(html[data-theme="dark"]) .apple-page .arena-card,
  :global(html[data-theme="dark"]) .apple-page .ranking-card,
  :global(html[data-theme="dark"]) .apple-page .ranking-list li,
  :global(html[data-theme="dark"]) .apple-page .status-item,
  :global(html[data-theme="dark"]) .apple-page .overlay-panel,
  :global(html[data-theme="dark"]) .apple-page .ghost-btn,
  :global(html[data-theme="dark"]) .apple-page .name-field input {
    background: #111827;
    color: #e5eefc;
    border-color: #243041;
  }

  :global(html[data-theme="dark"]) .apple-page .board {
    background: #0f172a;
    border-color: #243041;
  }

  :global(html[data-theme="dark"]) .apple-page .status-item span,
  :global(html[data-theme="dark"]) .apple-page .ranking-label,
  :global(html[data-theme="dark"]) .apple-page .submit-message,
  :global(html[data-theme="dark"]) .apple-page .ranking-empty,
  :global(html[data-theme="dark"]) .apple-page .rank-body span,
  :global(html[data-theme="dark"]) .apple-page .name-field span {
    color: #94a3b8;
  }
</style>
