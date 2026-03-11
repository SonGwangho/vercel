<script lang="ts">
  import { onMount } from "svelte";
  import type {
    JjaprimGosuRankingItem,
    JjaprimGosuScoreRequest,
  } from "$lib";

  type GameStatus = "idle" | "running" | "dead";
  type ArrowEntity = {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    vx: number;
    vy: number;
    rotation: number;
  };

  const GAME_NAME = "짭림고수";
  const GAME_CODE = 100;
  const ARENA_WIDTH = 800;
  const ARENA_HEIGHT = 600;
  const PLAYER_SIZE = 28;
  const PLAYER_SPEED = 290;

  let gameStatus = $state<GameStatus>("idle");
  let player = $state({
    x: 96,
    y: ARENA_HEIGHT / 2 - PLAYER_SIZE / 2,
  });
  let arrows = $state<ArrowEntity[]>([]);
  let elapsedMs = $state(0);
  let finalScore = $state(0);
  let userName = $state("");
  let isSubmitting = $state(false);
  let submitMessage = $state("");
  let rankings = $state<JjaprimGosuRankingItem[]>([]);
  let isRankingLoading = $state(false);
  let rankingError = $state("");

  let animationFrameId: number | null = null;
  let startedAt = 0;
  let lastFrameAt = 0;
  let spawnElapsed = 0;
  let nextSpawnDelay = 0;
  let arrowId = 1;
  const pressedKeys = new Set<string>();

  const elapsedSeconds = $derived((elapsedMs / 1000).toFixed(2));
  const finalSeconds = $derived((finalScore / 1000).toFixed(2));

  function resetPlayer() {
    player = {
      x: ARENA_WIDTH / 2 - PLAYER_SIZE / 2,
      y: ARENA_HEIGHT / 2 - PLAYER_SIZE / 2,
    };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function startGame() {
    stopLoop();
    gameStatus = "running";
    elapsedMs = 0;
    finalScore = 0;
    submitMessage = "";
    userName = "";
    spawnElapsed = 0;
    nextSpawnDelay = createSpawnDelay(0);
    arrowId = 1;
    arrows = [];
    resetPlayer();

    startedAt = performance.now();
    lastFrameAt = startedAt;
    animationFrameId = window.requestAnimationFrame(loop);
  }

  function resetToIdle() {
    stopLoop();
    gameStatus = "idle";
    elapsedMs = 0;
    finalScore = 0;
    submitMessage = "";
    userName = "";
    spawnElapsed = 0;
    nextSpawnDelay = createSpawnDelay(0);
    arrowId = 1;
    arrows = [];
    resetPlayer();
  }

  function stopLoop() {
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function currentSpawnInterval(ms: number) {
    return Math.max(56, 192 - ms / 55);
  }

  function createSpawnDelay(ms: number) {
    const base = currentSpawnInterval(ms);
    return base + Math.random() * (base * 0.85);
  }

  function spawnArrow() {
    const width = 26 + Math.random() * 18;
    const height = 6 + Math.random() * 4;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const playerCenterX = player.x + PLAYER_SIZE / 2;
    const playerCenterY = player.y + PLAYER_SIZE / 2;
    const edge = Math.floor(Math.random() * 4);
    let startX = 0;
    let startY = 0;

    if (edge === 0) {
      startX = 0;
      startY = Math.random() * ARENA_HEIGHT;
    } else if (edge === 1) {
      startX = ARENA_WIDTH;
      startY = Math.random() * ARENA_HEIGHT;
    } else if (edge === 2) {
      startX = Math.random() * ARENA_WIDTH;
      startY = 0;
    } else {
      startX = Math.random() * ARENA_WIDTH;
      startY = ARENA_HEIGHT;
    }

    const dx = playerCenterX - startX;
    const dy = playerCenterY - startY;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = 220 + Math.random() * 140 + elapsedMs / 55;
    const vx = (dx / distance) * speed;
    const vy = (dy / distance) * speed;

    arrows = [
      ...arrows,
      {
        id: arrowId++,
        x: clamp(startX - halfWidth, 0, ARENA_WIDTH - width),
        y: clamp(startY - halfHeight, 0, ARENA_HEIGHT - height),
        width,
        height,
        vx,
        vy,
        rotation: (Math.atan2(vy, vx) * 180) / Math.PI,
      },
    ];
  }

  function movePlayer(deltaSeconds: number) {
    const horizontal =
      (pressedKeys.has("arrowright") || pressedKeys.has("d") || pressedKeys.has("ㅇ") ? 1 : 0) -
      (pressedKeys.has("arrowleft") || pressedKeys.has("a") || pressedKeys.has("ㅁ") ? 1 : 0);
    const vertical =
      (pressedKeys.has("arrowdown") || pressedKeys.has("s") || pressedKeys.has("ㄴ") ? 1 : 0) -
      (pressedKeys.has("arrowup") || pressedKeys.has("w") || pressedKeys.has("ㅈ") ? 1 : 0);

    if (!horizontal && !vertical) {
      return;
    }

    const magnitude = Math.hypot(horizontal, vertical) || 1;
    const velocityX = (horizontal / magnitude) * PLAYER_SPEED * deltaSeconds;
    const velocityY = (vertical / magnitude) * PLAYER_SPEED * deltaSeconds;

    player = {
      x: clamp(player.x + velocityX, 0, ARENA_WIDTH - PLAYER_SIZE),
      y: clamp(player.y + velocityY, 0, ARENA_HEIGHT - PLAYER_SIZE),
    };
  }

  function hasCollision(arrow: ArrowEntity) {
    const playerPadding = 7;
    const arrowPaddingX = 6;
    const arrowPaddingY = 2;
    const playerLeft = player.x + playerPadding;
    const playerTop = player.y + playerPadding;
    const playerRight = player.x + PLAYER_SIZE - playerPadding;
    const playerBottom = player.y + PLAYER_SIZE - playerPadding;
    const arrowLeft = arrow.x + arrowPaddingX;
    const arrowTop = arrow.y + arrowPaddingY;
    const arrowRight = arrow.x + arrow.width - arrowPaddingX;
    const arrowBottom = arrow.y + arrow.height - arrowPaddingY;

    return !(
      playerRight < arrowLeft ||
      playerLeft > arrowRight ||
      playerBottom < arrowTop ||
      playerTop > arrowBottom
    );
  }

  function killPlayer(now: number) {
    stopLoop();
    gameStatus = "dead";
    finalScore = now - startedAt;
    elapsedMs = finalScore;
  }

  function loop(now: number) {
    if (gameStatus !== "running") {
      return;
    }

    const deltaMs = now - lastFrameAt;
    lastFrameAt = now;
    elapsedMs = now - startedAt;
    spawnElapsed += deltaMs;

    movePlayer(deltaMs / 1000);

    while (spawnElapsed >= nextSpawnDelay) {
      spawnElapsed -= nextSpawnDelay;
      spawnArrow();
      nextSpawnDelay = createSpawnDelay(elapsedMs);
    }

    arrows = arrows
      .map((arrow) => ({
        ...arrow,
        x: arrow.x + arrow.vx * (deltaMs / 1000),
        y: arrow.y + arrow.vy * (deltaMs / 1000),
      }))
      .filter(
        (arrow) =>
          arrow.x + arrow.width > -48 &&
          arrow.x < ARENA_WIDTH + 48 &&
          arrow.y + arrow.height > -48 &&
          arrow.y < ARENA_HEIGHT + 48,
      );

    if (arrows.some(hasCollision)) {
      killPlayer(now);
      return;
    }

    animationFrameId = window.requestAnimationFrame(loop);
  }

  function onKeyDown(event: KeyboardEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    if (event.key === " " || event.code === "Space") {
      event.preventDefault();

      if (gameStatus !== "running") {
        startGame();
      }
    }

    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D", "ㅈ", "ㅁ", "ㄴ", "ㅇ"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
    }

    pressedKeys.add(event.key.toLowerCase());
  }

  function onKeyUp(event: KeyboardEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    pressedKeys.delete(event.key.toLowerCase());
  }

  function normalizeRankingItem(item: unknown, index: number): JjaprimGosuRankingItem | null {
    if (!item || typeof item !== "object") {
      return null;
    }

    const candidate = item as Record<string, unknown>;
    const userNameValue = candidate.userName;
    const scoreValue = candidate.score;
    const rankValue = candidate.rank ?? candidate.ranking;
    const gameNameValue = candidate.gameName;

    if (typeof userNameValue !== "string") {
      return null;
    }

    const score =
      typeof scoreValue === "number"
        ? scoreValue
        : typeof scoreValue === "string"
          ? Number(scoreValue)
          : Number.NaN;

    if (!Number.isFinite(score)) {
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
      score,
      gameName: typeof gameNameValue === "string" ? gameNameValue : undefined,
    };
  }

  function normalizeRankingPayload(payload: unknown) {
    if (Array.isArray(payload)) {
      return payload
        .map((item, index) => normalizeRankingItem(item, index))
        .filter((item): item is JjaprimGosuRankingItem => item !== null);
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
      .filter((item): item is JjaprimGosuRankingItem => item !== null);
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
        .slice(0, 5);
    } catch (error) {
      rankings = [];
      rankingError = "랭킹을 불러오지 못했습니다.";
      console.error(error);
    } finally {
      isRankingLoading = false;
    }
  }

  async function submitScore() {
    const trimmedName = userName.trim();

    if (!trimmedName || isSubmitting || gameStatus !== "dead") {
      return;
    }

    isSubmitting = true;
    submitMessage = "";

    const payload: JjaprimGosuScoreRequest = {
      userName: trimmedName,
      gameName: GAME_NAME,
      gameCode: GAME_CODE,
      score: Number((finalScore / 1000).toFixed(2)),
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
        throw new Error(`score submit failed: ${response.status}`);
      }

      await fetchRanking();
      resetToIdle();
    } catch (error) {
      submitMessage = "기록 등록에 실패했습니다.";
      console.error(error);
    } finally {
      isSubmitting = false;
    }
  }

  onMount(() => {
    fetchRanking();
    resetToIdle();
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);

    return () => {
      stopLoop();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  });
</script>

<svelte:head>
  <title>짭림고수</title>
</svelte:head>

<section class="jjaprim-page">
  <article class="hero">
    <h1>짭림고수</h1>
  </article>

  <div class="game-layout">
    <article class="arena-card">
      <div class="arena">
        <div class="sky"></div>
        <div class="bamboo bamboo-a"></div>
        <div class="bamboo bamboo-b"></div>
        <div class="bamboo bamboo-c"></div>

        <div
          class="player"
          style={`transform: translate(${player.x}px, ${player.y}px);`}
          aria-label="player"
        >
          <span class="player-head"></span>
          <span class="player-body"></span>
        </div>

        {#each arrows as arrow (arrow.id)}
          <div
            class="arrow"
            style={`width:${arrow.width}px;height:${arrow.height}px;transform: translate(${arrow.x}px, ${arrow.y}px) rotate(${arrow.rotation}deg);`}
            aria-hidden="true"
          >
            <span class="shaft"></span>
            <span class="tip"></span>
            <span class="feather"></span>
          </div>
        {/each}

        {#if gameStatus !== "running"}
          <div class="overlay">
            <div class="overlay-panel">
              <h2>{gameStatus === "dead" ? "사망" : "대기 중"}</h2>
              <p>
                {#if gameStatus === "dead"}
                  {finalSeconds}초 버텼습니다. 이름을 입력하면 랭킹에 등록합니다.
                {:else}
                  시작 버튼을 누르면 바로 계측이 시작됩니다.
                {/if}
              </p>

              {#if gameStatus === "dead"}
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
                  {isSubmitting ? "등록 중..." : "기록 저장"}
                </button>
                {#if submitMessage}
                  <p class="submit-message">{submitMessage}</p>
                {/if}
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="guide">
        <p><strong>시작</strong> 스페이스바</p>
        <p><strong>이동</strong> 방향키 또는 WASD</p>
      </div>
    </article>

    <aside class="ranking-card">
      <div class="ranking-head">
        <div>
          <p class="ranking-label">Server Ranking</p>
          <h2>gameCode 100</h2>
        </div>
        <button type="button" class="ghost-btn" onclick={fetchRanking}>새로고침</button>
      </div>

      {#if isRankingLoading}
        <p class="ranking-empty">랭킹 불러오는 중...</p>
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
                <span>{Number(ranking.score).toFixed(2)}초</span>
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </aside>
  </div>
</section>

<style>
  .jjaprim-page {
    display: grid;
    gap: 12px;
    color: #10261f;
  }

  .hero {
    padding: 10px 4px 2px;
    background:
      none;
    color: #10261f;
    box-shadow: none;
  }

  .hero h1 {
    margin: 0;
    font-size: clamp(24px, 3vw, 32px);
    line-height: 0.98;
    letter-spacing: -0.03em;
  }

  .submit-btn,
  .ghost-btn {
    border: none;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 700;
  }

  .ranking-label {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #86efac;
    font-weight: 700;
  }

  .game-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.85fr) 260px;
    gap: 12px;
    align-items: start;
  }

  .arena-card,
  .ranking-card {
    background: linear-gradient(180deg, #fdfcf6 0%, #f4f8f2 100%);
    border: 1px solid #d8e5d6;
    border-radius: 22px;
    padding: 12px;
    box-shadow: 0 16px 30px rgba(16, 38, 31, 0.08);
  }

  .arena-card {
    display: grid;
    justify-items: center;
    align-content: start;
  }

  .arena {
    position: relative;
    width: 800px;
    height: 600px;
    border-radius: 18px;
    overflow: hidden;
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.38), transparent 24%),
      linear-gradient(180deg, #dff5df 0%, #b9deb9 38%, #6f9858 82%, #557240 100%);
    border: 1px solid rgba(50, 108, 63, 0.18);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.4),
      inset 0 -40px 80px rgba(36, 62, 26, 0.16);
  }

  .sky {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.88), transparent 13%),
      radial-gradient(circle at 78% 12%, rgba(255, 255, 255, 0.44), transparent 10%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.22) 0%, transparent 36%);
  }

  .bamboo {
    position: absolute;
    bottom: -10%;
    width: 34px;
    height: 130%;
    border-radius: 999px;
    background:
      repeating-linear-gradient(
        180deg,
        #3c7a46 0 44px,
        #23472d 44px 48px,
        #63a35d 48px 92px,
        #23472d 92px 96px
      );
    opacity: 0.78;
    filter: drop-shadow(0 12px 12px rgba(20, 48, 29, 0.16));
  }

  .bamboo-a {
    left: 14%;
    transform: rotate(4deg);
  }

  .bamboo-b {
    left: 68%;
    transform: rotate(-5deg);
  }

  .bamboo-c {
    left: 84%;
    width: 24px;
    opacity: 0.54;
    transform: rotate(3deg);
  }

  .player {
    position: absolute;
    left: 0;
    top: 0;
    width: 28px;
    height: 28px;
    transition: transform 0.05s linear;
    filter: drop-shadow(0 6px 8px rgba(24, 32, 17, 0.22));
  }

  .player-head,
  .player-body {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: block;
    border-radius: 999px;
  }

  .player-head {
    top: 0;
    width: 14px;
    height: 14px;
    background: linear-gradient(180deg, #f6d5b7 0%, #e9b98f 100%);
    border: 2px solid #2c1b0f;
  }

  .player-body {
    top: 11px;
    width: 18px;
    height: 17px;
    background: linear-gradient(180deg, #8d1f1f 0%, #431016 100%);
    border: 2px solid #1f2937;
  }

  .arrow {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: center;
  }

  .shaft,
  .tip,
  .feather {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
  }

  .shaft {
    left: 0;
    right: 10px;
    height: 3px;
    border-radius: 999px;
    background: linear-gradient(90deg, #996238 0%, #4a2b13 100%);
  }

  .tip {
    right: 0;
    width: 0;
    height: 0;
    border-left: 8px solid #c2410c;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
  }

  .feather {
    left: -4px;
    width: 10px;
    height: 8px;
    background: linear-gradient(135deg, #e5e7eb 0%, #94a3b8 100%);
    clip-path: polygon(100% 50%, 0 0, 18% 50%, 0 100%);
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(12, 25, 20, 0.36);
    backdrop-filter: blur(4px);
  }

  .overlay-panel {
    width: min(360px, calc(100% - 32px));
    display: grid;
    gap: 10px;
    padding: 18px;
    border-radius: 18px;
    background: rgba(252, 252, 248, 0.92);
    color: #10261f;
    box-shadow: 0 24px 42px rgba(12, 25, 20, 0.18);
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

  .name-field input {
    height: 38px;
    border: 1px solid #b9cec0;
    border-radius: 12px;
    padding: 0 12px;
    font: inherit;
    background: #fff;
  }

  .submit-btn {
    height: 40px;
    color: #f8fafc;
    background: linear-gradient(135deg, #1f5d48 0%, #134e4a 100%);
  }

  .submit-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .submit-message {
    font-size: 14px;
    color: #14532d;
  }

  .guide {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    margin-top: 10px;
    color: #446253;
    font-size: 12px;
  }

  .ranking-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    margin-bottom: 10px;
  }

  .ghost-btn {
    padding: 8px 12px;
    color: #163c33;
    background: #eef8f0;
    border: 1px solid #c8dfcc;
  }

  .ranking-empty {
    margin: 14px 0 0;
    color: #4b6358;
    font-size: 13px;
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
    background: linear-gradient(180deg, #f6fbf7 0%, #edf7ef 100%);
    border: 1px solid #d4e7d7;
  }

  .rank-no {
    min-width: 42px;
    text-align: center;
    padding: 6px 8px;
    border-radius: 999px;
    background: linear-gradient(135deg, #173d34 0%, #356453 100%);
    color: #f8fafc;
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
    color: #4b6358;
    font-size: 13px;
  }

  @media (max-width: 920px) {
    .hero,
    .game-layout {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .hero,
    .arena-card,
    .ranking-card {
      padding: 12px;
      border-radius: 16px;
    }

    .arena-card {
      overflow-x: auto;
    }
  }
</style>
