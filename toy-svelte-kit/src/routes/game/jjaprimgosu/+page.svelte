<script lang="ts">
  import { onMount } from "svelte";
  import { createRanking, loadRankings as loadRankingList } from "$lib";
  import { requireGameCode } from "$lib/gameCodes";
  import type {
    JjaprimGosuRankingItem,
    JjaprimGosuScoreRequest,
    JjaprimGosuStatus as GameStatus,
    JjaprimGosuArrow as ArrowEntity,
  } from "$lib";

  const gameMeta = requireGameCode("jjaprimgosu");
  const GAME_NAME = gameMeta.gameName;
  const GAME_CODE = gameMeta.gameCode;
  const ARENA_WIDTH = 800;
  const ARENA_HEIGHT = 600;
  const PLAYER_SIZE = 28;
  const PLAYER_SPEED = 290;
  const MAX_SIMULATION_STEP_MS = 10;

  let gameStatus = $state<GameStatus>("idle");
  let player = $state.raw({
    x: 96,
    y: ARENA_HEIGHT / 2 - PLAYER_SIZE / 2,
  });
  let arrows = $state.raw<ArrowEntity[]>([]);
  let arrowBodies: ArrowEntity[] = [];
  let playerPosition = { x: 96, y: ARENA_HEIGHT / 2 - PLAYER_SIZE / 2 };
  let simulationMs = 0;
  let arenaViewport = $state<HTMLDivElement | null>(null);
  let arenaScale = $state(1);
  let elapsedMs = $state(0);
  let finalScore = $state(0);
  let userName = $state("");
  let isSubmitting = $state(false);
  let submitMessage = $state("");
  let rankings = $state<JjaprimGosuRankingItem[]>([]);
  let isRankingLoading = $state(false);
  let rankingError = $state("");

  let animationFrameId: number | null = null;
  let lastFrameAt = 0;
  let spawnElapsed = 0;
  let nextSpawnDelay = 0;
  let arrowId = 1;
  const pressedKeys = new Set<string>();

  const elapsedSeconds = $derived((elapsedMs / 1000).toFixed(2));
  const finalSeconds = $derived((finalScore / 1000).toFixed(2));

  function resetPlayer() {
    playerPosition = { x: ARENA_WIDTH / 2 - PLAYER_SIZE / 2, y: ARENA_HEIGHT / 2 - PLAYER_SIZE / 2 };
    player = { ...playerPosition };
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function startGame() {
    if (isSubmitting) return;
    stopLoop();
    pressedKeys.clear();
    gameStatus = "running";
    elapsedMs = 0;
    simulationMs = 0;
    finalScore = 0;
    submitMessage = "";
    userName = "";
    spawnElapsed = 0;
    nextSpawnDelay = createSpawnDelay(0);
    arrowId = 1;
    arrows = [];
    arrowBodies = [];
    resetPlayer();

    lastFrameAt = performance.now();
    animationFrameId = window.requestAnimationFrame(loop);
  }

  function resetToIdle() {
    stopLoop();
    pressedKeys.clear();
    gameStatus = "idle";
    elapsedMs = 0;
    simulationMs = 0;
    finalScore = 0;
    submitMessage = "";
    userName = "";
    spawnElapsed = 0;
    nextSpawnDelay = createSpawnDelay(0);
    arrowId = 1;
    arrows = [];
    arrowBodies = [];
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
    const playerCenterX = playerPosition.x + PLAYER_SIZE / 2;
    const playerCenterY = playerPosition.y + PLAYER_SIZE / 2;
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
    const speed = 220 + Math.random() * 140 + simulationMs / 55;
    const vx = (dx / distance) * speed;
    const vy = (dy / distance) * speed;

    arrowBodies.push({
        id: arrowId++,
        x: clamp(startX - halfWidth, 0, ARENA_WIDTH - width),
        y: clamp(startY - halfHeight, 0, ARENA_HEIGHT - height),
        width,
        height,
        vx,
        vy,
        rotation: (Math.atan2(vy, vx) * 180) / Math.PI,
    });
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

    playerPosition.x = clamp(playerPosition.x + velocityX, 0, ARENA_WIDTH - PLAYER_SIZE);
    playerPosition.y = clamp(playerPosition.y + velocityY, 0, ARENA_HEIGHT - PLAYER_SIZE);
  }

  function hasSweptCollision(arrow: ArrowEntity, previousX: number, previousY: number) {
    const left = Math.min(previousX, arrow.x) + 6;
    const top = Math.min(previousY, arrow.y) + 2;
    const right = Math.max(previousX, arrow.x) + arrow.width - 6;
    const bottom = Math.max(previousY, arrow.y) + arrow.height - 2;
    return !(playerPosition.x + PLAYER_SIZE - 7 < left || playerPosition.x + 7 > right ||
      playerPosition.y + PLAYER_SIZE - 7 < top || playerPosition.y + 7 > bottom);
  }

  function publishFrame() {
    player = { ...playerPosition };
    arrows = arrowBodies.map((arrow) => ({ ...arrow }));
    elapsedMs = simulationMs;
  }

  function killPlayer(now: number) {
    stopLoop();
    pressedKeys.clear();
    gameStatus = "dead";
    finalScore = now;
    elapsedMs = finalScore;
  }

  function advanceFrame(deltaMs: number) {
    simulationMs += deltaMs;
    spawnElapsed += deltaMs;
    movePlayer(deltaMs / 1000);
    while (spawnElapsed >= nextSpawnDelay) {
      spawnElapsed -= nextSpawnDelay;
      spawnArrow();
      nextSpawnDelay = createSpawnDelay(simulationMs);
    }
    let collisionDetected = false;
    let retained = 0;
    for (const arrow of arrowBodies) {
      const previousX = arrow.x;
      const previousY = arrow.y;
      arrow.x += arrow.vx * (deltaMs / 1000);
      arrow.y += arrow.vy * (deltaMs / 1000);
      if (!collisionDetected && hasSweptCollision(arrow, previousX, previousY)) collisionDetected = true;
      if (arrow.x + arrow.width > -48 && arrow.x < ARENA_WIDTH + 48 &&
          arrow.y + arrow.height > -48 && arrow.y < ARENA_HEIGHT + 48) {
        arrowBodies[retained++] = arrow;
      }
    }
    arrowBodies.length = retained;
    return collisionDetected;
  }

  function loop(now: number) {
    animationFrameId = null;
    if (gameStatus !== "running" || document.hidden) return;
    // Bound recovery work after a stalled frame; never run an unbounded catch-up loop.
    let remainingMs = Math.min(Math.max(0, now - lastFrameAt), 100);
    lastFrameAt = now;
    while (remainingMs > 0) {
      const stepMs = Math.min(remainingMs, MAX_SIMULATION_STEP_MS);
      if (advanceFrame(stepMs)) {
        publishFrame();
        killPlayer(simulationMs);
        return;
      }
      remainingMs -= stepMs;
    }
    publishFrame();
    animationFrameId = requestAnimationFrame(loop);
  }

  function releaseControls() { pressedKeys.clear(); }
  function handleVisibility() {
    releaseControls();
    stopLoop();
    if (!document.hidden && gameStatus === "running") {
      lastFrameAt = performance.now();
      animationFrameId = requestAnimationFrame(loop);
    }
  }

  $effect(() => {
    if (!arenaViewport) return;
    const observer = new ResizeObserver(([entry]) => { arenaScale = Math.min(1, entry.contentRect.width / ARENA_WIDTH); });
    observer.observe(arenaViewport);
    return () => observer.disconnect();
  });

  function onKeyDown(event: KeyboardEvent) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest("button, a, select"))
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

  function setTouchControl(event: PointerEvent, key: string, isPressed: boolean) {
    event.preventDefault();

    if (isPressed && gameStatus === "running") {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      pressedKeys.add(key);
      return;
    }

    const element = event.currentTarget as HTMLElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    pressedKeys.delete(key);
  }

  async function fetchRanking() {
    isRankingLoading = true;
    rankingError = "";

    try {
      const data = await loadRankingList(GAME_CODE, 5);
      rankings = data.rankings as JjaprimGosuRankingItem[];
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
      await createRanking(payload);
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
    window.addEventListener("blur", releaseControls);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopLoop();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseControls);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  });
</script>

<svelte:head>
  <title>짭림고수 · 장난감 웹</title>
</svelte:head>

<section class="jjaprim-page">
  <header class="game-heading">
    <div><h1>짭림고수</h1><p>쏟아지는 화살을 피하고, 가장 오래 살아남아 보세요.</p></div>
    <span class="game-status">{gameStatus === "running" ? "플레이 중" : gameStatus === "dead" ? "게임 종료" : "시작 대기"}</span>
  </header>

  <div class="game-layout">
    <article class="arena-card">
      <div class="arena-toolbar"><span>생존 시간</span><strong>{elapsedSeconds}<small>초</small></strong></div>
      <div class="arena-viewport" bind:this={arenaViewport}>
      <div class="arena" style={`transform:scale(${arenaScale});`}>

        <div
          class="player"
          style={`transform: translate(${player.x}px, ${player.y}px);`}
          aria-label="플레이어"
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

      </div>
        {#if gameStatus !== "running"}
          <div class="overlay">
            <div class="overlay-panel">
              <h2>{gameStatus === "dead" ? "게임 종료" : "화살을 피해 보세요"}</h2>
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
                  <input
                    bind:value={userName}
                    maxlength="20"
                    placeholder="이름 입력"
                    onkeydown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void submitScore();
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  class="game-action"
                  onclick={submitScore}
                  disabled={!userName.trim() || isSubmitting}
                >
                  {isSubmitting ? "등록 중..." : "기록 저장"}
                </button>
                {#if submitMessage}
                  <p class="submit-message">{submitMessage}</p>
                {/if}
              {/if}

              <button type="button" class="game-action start-btn" onclick={startGame} disabled={isSubmitting}>
                {gameStatus === "dead" ? "다시 도전" : "게임 시작"}
              </button>
            </div>
          </div>
        {/if}
      </div>

      <div class="touch-controls" aria-label="화면 이동 버튼">
        <span></span>
        <button
          type="button"
          aria-label="위로 이동"
          onpointerdown={(event) => setTouchControl(event, "arrowup", true)}
          onpointerup={(event) => setTouchControl(event, "arrowup", false)}
          onpointercancel={(event) => setTouchControl(event, "arrowup", false)}
          onpointerleave={(event) => setTouchControl(event, "arrowup", false)}
        ><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
        <span></span>
        <button
          type="button"
          aria-label="왼쪽으로 이동"
          onpointerdown={(event) => setTouchControl(event, "arrowleft", true)}
          onpointerup={(event) => setTouchControl(event, "arrowleft", false)}
          onpointercancel={(event) => setTouchControl(event, "arrowleft", false)}
          onpointerleave={(event) => setTouchControl(event, "arrowleft", false)}
        ><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button>
        <button
          type="button"
          aria-label="아래로 이동"
          onpointerdown={(event) => setTouchControl(event, "arrowdown", true)}
          onpointerup={(event) => setTouchControl(event, "arrowdown", false)}
          onpointercancel={(event) => setTouchControl(event, "arrowdown", false)}
          onpointerleave={(event) => setTouchControl(event, "arrowdown", false)}
        ><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button>
        <button
          type="button"
          aria-label="오른쪽으로 이동"
          onpointerdown={(event) => setTouchControl(event, "arrowright", true)}
          onpointerup={(event) => setTouchControl(event, "arrowright", false)}
          onpointercancel={(event) => setTouchControl(event, "arrowright", false)}
          onpointerleave={(event) => setTouchControl(event, "arrowright", false)}
        ><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button>
      </div>
      <div class="guide game-rules">
        <p><strong>시작</strong> <kbd>Space</kbd></p>
        <p><strong>이동</strong> 방향키 또는 <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></p>
      </div>
    </article>

    <aside class="ranking-card">
      <div class="ranking-head">
        <h2>랭킹</h2>
      </div>



      {#if isRankingLoading}
        <p class="ranking-empty">랭킹 불러오는 중...</p>
      {:else if rankingError}
        <div class="ranking-error" role="alert">
          <p class="ranking-empty">{rankingError}</p>
          <button type="button" onclick={() => void fetchRanking()}>다시 시도</button>
        </div>
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
  .game-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 16px; align-items: start; }
  .arena-card, .ranking-card { min-width: 0; padding: 24px; border-radius: var(--panel-radius); background: var(--surface); }
  .arena-toolbar { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 16px; color: var(--muted); font-size: 12px; }
  .arena-toolbar strong { color: var(--brand-strong); font-size: 28px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .arena-toolbar small { margin-left: 6px; color: var(--muted); font-size: 12px; font-weight: 400; }
  .arena-viewport { position: relative; width: 100%; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 12px; background: var(--surface-muted); }
  .arena { position: absolute; top: 0; left: 0; width: 800px; height: 600px; transform-origin: top left; contain: layout paint; background: var(--surface-muted); }
  .player { position: absolute; left: 0; top: 0; width: 28px; height: 28px; }
  .player-head, .player-body { position: absolute; left: 50%; transform: translateX(-50%); display: block; border-radius: 8px; }
  .player-head { top: 0; width: 14px; height: 14px; background: #efc9a8; border: 2px solid #523a2e; }
  .player-body { top: 11px; width: 18px; height: 17px; background: var(--brand); border: 2px solid var(--brand-strong); }
  .arrow { position: absolute; left: 0; top: 0; transform-origin: center; }
  .shaft, .tip, .feather { position: absolute; top: 50%; transform: translateY(-50%); }
  .shaft { left: 0; right: 8px; height: 3px; border-radius: 2px; background: var(--text); }
  .tip { right: 0; width: 0; height: 0; border-left: 8px solid var(--danger); border-top: 4px solid transparent; border-bottom: 4px solid transparent; }
  .feather { left: -4px; width: 8px; height: 6px; background: var(--muted); border-radius: 2px; }
  .overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--bg) 84%, transparent); }
  .overlay-panel { display: grid; gap: 12px; width: min(360px, 100%); max-height: 100%; overflow-y: auto; padding: 24px; border-radius: 12px; background: var(--surface); }
  .overlay-panel h2, .overlay-panel p { margin: 0; }
  .overlay-panel h2 { color: var(--text-strong); font-size: 20px; }
  .overlay-panel p { color: var(--muted); font-size: 13px; line-height: 1.7; }
  .name-field { display: grid; gap: 6px; font-size: 12px; color: var(--muted); }
  .name-field input { width: 100%; height: 44px; min-width: 0; border: 1px solid var(--line-strong); border-radius: var(--control-radius); padding: 0 12px; background: var(--surface-muted); color: var(--text); }
  .overlay-panel .submit-message { color: var(--danger); }
  .guide { margin-top: 16px; }
  .touch-controls { display: none; grid-template-columns: repeat(3, 48px); gap: 6px; justify-content: center; margin-top: 16px; touch-action: none; }
  .touch-controls button { display: grid; place-items: center; width: 48px; height: 48px; padding: 0; border: 1px solid var(--line-strong); border-radius: var(--control-radius); background: var(--surface-muted); color: var(--text); user-select: none; touch-action: none; }
  .touch-controls button:active { background: var(--brand-soft); color: var(--brand-strong); }
  .ranking-head h2 { margin: 0 0 16px; font-size: 16px; font-weight: 650; }
  .ranking-empty { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
  .ranking-error { display: grid; justify-items: start; gap: 12px; }
  .ranking-error button { min-height: 44px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--control-radius); background: var(--surface); color: var(--text); font-size: 13px; }
  .ranking-list { list-style: none; margin: 0; padding: 0; }
  .ranking-list li { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 56px; }
  .rank-no { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .rank-body { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-width: 0; font-size: 13px; }
  .rank-body strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .rank-body span { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ranking-list li:first-child .rank-no, .ranking-list li:first-child .rank-body span { color: var(--brand-strong); }
  @media (max-width: 1000px) { .game-layout { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .arena-card, .ranking-card { padding: 16px; } .overlay-panel { padding: 16px; gap: 10px; } .overlay-panel h2 { font-size: 17px; } }
  @media (pointer: coarse), (max-width: 920px) { .touch-controls { display: grid; } }
</style>
