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
      x: 96,
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

  function restartGame() {
    startGame();
  }

  function stopLoop() {
    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function currentSpawnInterval(ms: number) {
    return Math.max(70, 240 - ms / 55);
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
      (pressedKeys.has("arrowright") || pressedKeys.has("d") ? 1 : 0) -
      (pressedKeys.has("arrowleft") || pressedKeys.has("a") ? 1 : 0);
    const vertical =
      (pressedKeys.has("arrowdown") || pressedKeys.has("s") ? 1 : 0) -
      (pressedKeys.has("arrowup") || pressedKeys.has("w") ? 1 : 0);

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
    return !(
      player.x + PLAYER_SIZE < arrow.x ||
      player.x > arrow.x + arrow.width ||
      player.y + PLAYER_SIZE < arrow.y ||
      player.y > arrow.y + arrow.height
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
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();

      if (gameStatus !== "running") {
        startGame();
      }
    }

    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
    }

    pressedKeys.add(event.key.toLowerCase());
  }

  function onKeyUp(event: KeyboardEvent) {
    pressedKeys.delete(event.key.toLowerCase());
  }

  function normalizeRankingItem(item: unknown, index: number): JjaprimGosuRankingItem | null {
    if (!item || typeof item !== "object") {
      return null;
    }

    const candidate = item as Record<string, unknown>;
    const userNameValue = candidate.userName;
    const scoreValue = candidate.score;
    const rankValue = candidate.rank;
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

      rankings = normalizeRankingPayload(await response.json());
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

      submitMessage = "기록이 등록되었습니다.";
      await fetchRanking();
    } catch (error) {
      submitMessage = "기록 등록에 실패했습니다.";
      console.error(error);
    } finally {
      isSubmitting = false;
    }
  }

  onMount(() => {
    fetchRanking();
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
    <div class="hero-copy">
      <h1>짭림고수</h1>
      <p class="lead">스페이스바로 시작. 화살에 닿으면 끝.</p>
      <p class="hint">이동: 방향키 / WASD</p>
    </div>

    <div class="score-card">
      <p class="score-label">현재 기록</p>
      <strong>{gameStatus === "dead" ? finalSeconds : elapsedSeconds}초</strong>
      <p class="score-sub">
        {gameStatus === "running"
          ? "살아남는 동안 계속 측정 중"
          : gameStatus === "dead"
            ? "사망 시점 기록"
            : "시작 전 대기 중"}
      </p>
    </div>
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
    display: grid;
    grid-template-columns: minmax(0, 1.8fr) minmax(240px, 0.8fr);
    gap: 12px;
    padding: 16px 18px;
    border-radius: 20px;
    background:
      radial-gradient(circle at top left, rgba(236, 253, 245, 0.92), transparent 44%),
      linear-gradient(135deg, #143b31 0%, #264f2b 52%, #6f1d1b 100%);
    color: #f1f5f9;
    overflow: hidden;
  }

  .hero h1 {
    margin: 0;
    font-size: clamp(26px, 3.5vw, 38px);
    line-height: 0.98;
  }

  .lead {
    margin: 6px 0 0;
    line-height: 1.3;
    color: rgba(241, 245, 249, 0.88);
  }

  .submit-btn,
  .ghost-btn {
    border: none;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 700;
  }

  .hint {
    margin: 6px 0 0;
    color: rgba(241, 245, 249, 0.76);
    font-size: 13px;
  }

  .score-card {
    display: grid;
    align-content: center;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(12px);
  }

  .score-label,
  .ranking-label {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #86efac;
    font-weight: 700;
  }

  .score-card strong {
    font-size: clamp(28px, 4vw, 38px);
    line-height: 1;
  }

  .score-sub {
    margin: 0;
    color: rgba(241, 245, 249, 0.8);
    font-size: 13px;
  }

  .game-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.85fr) 260px;
    gap: 12px;
  }

  .arena-card,
  .ranking-card {
    background: #f8faf7;
    border: 1px solid #d7e6d9;
    border-radius: 18px;
    padding: 12px;
    box-shadow: 0 14px 28px rgba(16, 38, 31, 0.06);
  }

  .arena {
    position: relative;
    width: 800px;
    height: 600px;
    border-radius: 16px;
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(197, 242, 215, 0.72) 0%, rgba(179, 223, 195, 0.8) 54%, #5a7c45 100%);
  }

  .sky {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.86), transparent 18%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.28) 0%, transparent 50%);
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
        #326c3f 0 44px,
        #254f31 44px 48px,
        #3d824a 48px 92px,
        #254f31 92px 96px
      );
    opacity: 0.7;
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
    background: #f6d5b7;
    border: 2px solid #2c1b0f;
  }

  .player-body {
    top: 11px;
    width: 18px;
    height: 17px;
    background: linear-gradient(180deg, #7f1d1d 0%, #3f0d12 100%);
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
    background: linear-gradient(90deg, #7c4a20 0%, #3f2813 100%);
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
    background: rgba(12, 25, 20, 0.52);
    backdrop-filter: blur(5px);
  }

  .overlay-panel {
    width: min(360px, calc(100% - 32px));
    display: grid;
    gap: 10px;
    padding: 18px;
    border-radius: 18px;
    background: rgba(248, 250, 247, 0.94);
    color: #10261f;
    box-shadow: 0 22px 40px rgba(12, 25, 20, 0.18);
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
    color: #365347;
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
    color: #134e4a;
    background: #ecfdf5;
    border: 1px solid #bbf7d0;
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
    background: #f0f9f4;
    border: 1px solid #d4ead9;
  }

  .rank-no {
    min-width: 42px;
    text-align: center;
    padding: 6px 8px;
    border-radius: 999px;
    background: #143b31;
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
