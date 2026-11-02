<script lang="ts">
  import { onMount } from "svelte";
  import { createRanking, loadRankings as loadRankingList } from "$lib";
  import { requireGameCode } from "$lib/gameCodes";
  import fruitDefs from "$lib/assets/data/suika/fruits.json";
  import type {
    SuikaFruitDefinition,
    SuikaRankingItem,
    SuikaScoreRequest,
    SuikaStatus as GameStatus,
    SuikaFruitBody as FruitBody,
  } from "$lib";

  const gameMeta = requireGameCode("suika");
  const GAME_NAME = gameMeta.gameName;
  const GAME_CODE = gameMeta.gameCode;
  const BOARD_WIDTH = 430;
  const BOARD_HEIGHT = 560;
  const DROP_LINE_Y = 74;
  const GRAVITY = 1800;
  const RESTITUTION = 0.08;
  const FRICTION = 0.994;
  const COLLISION_SURFACE_FRICTION = 0.025;
  const POSITIONAL_SLOP = 0.04;
  const POSITIONAL_CORRECTION = 0.86;
  const STACKING_BIAS = 0.72;
  const FIXED_TIMESTEP = 1 / 180;
  const MAX_STEPS = 8;
  const DROP_MOVE_SPEED = 520;
  const STARTER_MAX_LEVEL = 4;
  const WALL_PADDING = 14;
  const fruitDefinitions = fruitDefs as SuikaFruitDefinition[];

  let gameStatus = $state<GameStatus>("idle");
  let fruits = $state.raw<FruitBody[]>([]);
  let physicsBodies: FruitBody[] = [];
  let boardViewport = $state<HTMLDivElement | null>(null);
  let boardScale = $state(1);
  let boardRect: DOMRect | null = null;
  let guideFrame: number | null = null;
  let pointerClientX = 0;
  const inverseMassByLevel = fruitDefinitions.map((fruit) => 1 / Math.max(fruit.radius / 18, 1) ** 2);
  let score = $state(0);
  let bestLevel = $state(0);
  let dropX = $state(BOARD_WIDTH / 2);
  let nextLevel = $state(randomStarterLevel());
  let previewLevel = $state(randomStarterLevel());
  let userName = $state("");
  let submitMessage = $state("");
  let rankings = $state<SuikaRankingItem[]>([]);
  let isSubmitting = $state(false);
  let isRankingLoading = $state(false);
  let rankingError = $state("");

  let animationFrameId: number | null = null;
  let lastTick = 0;
  let physicsAccumulator = 0;
  let fruitId = 1;
  let lockDropUntil = 0;
  let overflowMs = 0;
  const pressedKeys = new Set<string>();

  const scoreLabel = $derived(String(score));
  const nextFruit = $derived(fruitDefinitions[nextLevel]);
  const previewFruit = $derived(fruitDefinitions[previewLevel]);
  const bestRankingScore = $derived(rankings[0]?.score ?? 0);

  function randomStarterLevel() {
    return Math.floor(Math.random() * (STARTER_MAX_LEVEL + 1));
  }

  function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
  }

  function resetGame() {
    stopLoop();
    if (guideFrame !== null) cancelAnimationFrame(guideFrame);
    guideFrame = null;
    fruits = [];
    physicsBodies = [];
    score = 0;
    bestLevel = 0;
    dropX = BOARD_WIDTH / 2;
    nextLevel = randomStarterLevel();
    previewLevel = randomStarterLevel();
    userName = "";
    submitMessage = "";
    overflowMs = 0;
    lockDropUntil = 0;
    physicsAccumulator = 0;
    pressedKeys.clear();
    gameStatus = "idle";
  }

  function stopLoop() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  function startGame() {
    if (isSubmitting) return;
    resetGame();
    gameStatus = "running";
    lastTick = performance.now();
    physicsAccumulator = 0;
    animationFrameId = requestAnimationFrame(loop);
  }

  function setDropFromPointer(clientX: number, rect: DOMRect) {
    const localX = (clientX - rect.left) * (BOARD_WIDTH / rect.width);
    const radius = fruitDefinitions[nextLevel].radius;
    dropX = clamp(localX, radius + WALL_PADDING, BOARD_WIDTH - radius - WALL_PADDING);
  }

  function updateDropGuide(deltaSeconds: number) {
    const horizontal =
      (pressedKeys.has("arrowright") || pressedKeys.has("d") || pressedKeys.has("ㅇ") ? 1 : 0) -
      (pressedKeys.has("arrowleft") || pressedKeys.has("a") || pressedKeys.has("ㅁ") ? 1 : 0);

    if (!horizontal) {
      return;
    }

    const radius = fruitDefinitions[nextLevel].radius;
    dropX = clamp(
      dropX + horizontal * DROP_MOVE_SPEED * deltaSeconds,
      radius + WALL_PADDING,
      BOARD_WIDTH - radius - WALL_PADDING,
    );
  }

  function queueNextFruit() {
    nextLevel = previewLevel;
    previewLevel = randomStarterLevel();
  }

  function dropFruit() {
    const now = performance.now();
    if (gameStatus !== "running" || now < lockDropUntil) {
      return;
    }

    const definition = fruitDefinitions[nextLevel];
    const radius = definition.radius;
    physicsBodies.push({
        id: fruitId++,
        level: nextLevel,
        x: clamp(dropX, radius + WALL_PADDING, BOARD_WIDTH - radius - WALL_PADDING),
        y: DROP_LINE_Y,
        vx: 0,
        vy: 0,
        radius,
        mergedAt: 0,
    });
    queueNextFruit();
    lockDropUntil = now + 220;
  }

  function resolveWalls(body: FruitBody) {
    if (body.x - body.radius < WALL_PADDING) {
      body.x = WALL_PADDING + body.radius;
      body.vx = Math.abs(body.vx) * 0.22;
    }

    if (body.x + body.radius > BOARD_WIDTH - WALL_PADDING) {
      body.x = BOARD_WIDTH - WALL_PADDING - body.radius;
      body.vx = -Math.abs(body.vx) * 0.22;
    }

    if (body.y + body.radius > BOARD_HEIGHT - WALL_PADDING) {
      body.y = BOARD_HEIGHT - WALL_PADDING - body.radius;
      body.vy = -Math.abs(body.vy) * RESTITUTION;
      body.vx *= 0.96;
    }
  }

  function simulateStep(deltaSeconds: number, now: number) {
    // The solver uses plain bodies; publish one immutable render snapshot per animation frame.
    const bodies = physicsBodies;
    const bodyCount = bodies.length;
    for (const body of bodies) {
      body.vy += GRAVITY * deltaSeconds;
      body.x += body.vx * deltaSeconds;
      body.y += body.vy * deltaSeconds;
    }
    const mergeCandidates = new Set<number>();

    for (let iteration = 0; iteration < 4; iteration += 1) {
      for (const body of bodies) {
        resolveWalls(body);
      }

      for (let i = 0; i < bodies.length; i += 1) {
        for (let j = i + 1; j < bodies.length; j += 1) {
          const a = bodies[i];
          const b = bodies[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const minDistance = a.radius + b.radius;
          if (Math.abs(dx) >= minDistance || Math.abs(dy) >= minDistance) continue;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= minDistance * minDistance) continue;
          const distance = Math.sqrt(distanceSquared) || 0.0001;

          if (
            a.level === b.level &&
            a.level < fruitDefinitions.length - 1 &&
            now - a.mergedAt > 120 &&
            now - b.mergedAt > 120
          ) {
            mergeCandidates.add(i * bodyCount + j);
          }

          const nx = dx / distance;
          const ny = dy / distance;
          const rawOverlap = minDistance - distance;
          const overlap = Math.max(0, rawOverlap - POSITIONAL_SLOP) * POSITIONAL_CORRECTION;

          if (overlap <= 0) {
            continue;
          }

          const inverseMassA = inverseMassByLevel[a.level];
          const inverseMassB = inverseMassByLevel[b.level];
          const inverseMassSum = inverseMassA + inverseMassB;
          const mostlyVertical = Math.abs(ny) > 0.45;
          const aIsUpper = a.y < b.y;
          const biasA = mostlyVertical ? (aIsUpper ? 1 + STACKING_BIAS : 1 - STACKING_BIAS * 0.35) : 1;
          const biasB = mostlyVertical ? (aIsUpper ? 1 - STACKING_BIAS * 0.35 : 1 + STACKING_BIAS) : 1;
          const weightedInverseMassA = inverseMassA * biasA;
          const weightedInverseMassB = inverseMassB * biasB;
          const weightedInverseMassSum = weightedInverseMassA + weightedInverseMassB;
          const correctionA = overlap * (weightedInverseMassA / weightedInverseMassSum);
          const correctionB = overlap * (weightedInverseMassB / weightedInverseMassSum);

          a.x -= nx * correctionA;
          a.y -= ny * correctionA;
          b.x += nx * correctionB;
          b.y += ny * correctionB;

          const relativeVx = b.vx - a.vx;
          const relativeVy = b.vy - a.vy;
          const separatingVelocity = relativeVx * nx + relativeVy * ny;

          if (separatingVelocity < 0) {
            const impulse = (-(1 + RESTITUTION) * separatingVelocity) / inverseMassSum;
            a.vx -= nx * impulse * inverseMassA;
            a.vy -= ny * impulse * inverseMassA;
            b.vx += nx * impulse * inverseMassB;
            b.vy += ny * impulse * inverseMassB;

            const tangentX = -ny;
            const tangentY = nx;
            const tangentVelocity = relativeVx * tangentX + relativeVy * tangentY;
            const tangentImpulse =
              (tangentVelocity * COLLISION_SURFACE_FRICTION) / inverseMassSum;

            a.vx += tangentX * tangentImpulse * inverseMassA;
            a.vy += tangentY * tangentImpulse * inverseMassA;
            b.vx -= tangentX * tangentImpulse * inverseMassB;
            b.vy -= tangentY * tangentImpulse * inverseMassB;
          }
        }
      }
    }

    for (const body of bodies) {
      resolveWalls(body);
      body.vx *= FRICTION;

      if (Math.abs(body.vx) < 2) {
        body.vx = 0;
      }

      if (Math.abs(body.vy) < 4 && body.y + body.radius >= BOARD_HEIGHT - WALL_PADDING - 2) {
        body.vy = 0;
      }
    }

    const mergedIds = new Set<number>();
    const additions: FruitBody[] = [];
    // Stable pair order preserves the existing merge priority, without a second all-pairs scan.
    for (const pair of Array.from(mergeCandidates).sort((a, b) => a - b)) {
      const a = bodies[Math.floor(pair / bodyCount)];
      const b = bodies[pair % bodyCount];
      if (mergedIds.has(a.id) || mergedIds.has(b.id) || a.level !== b.level ||
          a.level >= fruitDefinitions.length - 1 || now - a.mergedAt <= 120 || now - b.mergedAt <= 120) continue;
      mergedIds.add(a.id);
      mergedIds.add(b.id);
      const next = fruitDefinitions[a.level + 1];
      const anchor = a.y >= b.y ? a : b;
      additions.push({
        id: fruitId++, level: next.level,
        x: clamp(anchor.x, next.radius + WALL_PADDING, BOARD_WIDTH - next.radius - WALL_PADDING),
        y: clamp(anchor.y, next.radius + WALL_PADDING, BOARD_HEIGHT - next.radius - WALL_PADDING),
        vx: (anchor.vx + (anchor === a ? b.vx : a.vx) * 0.35) / 1.35,
        vy: Math.min((a.vy + b.vy) / 2, -70), radius: next.radius, mergedAt: now
      });
      score += next.score;
      bestLevel = Math.max(bestLevel, next.level);
    }
    if (mergedIds.size > 0) physicsBodies = [...bodies.filter((fruit) => !mergedIds.has(fruit.id)), ...additions];
  }

  function loop(now: number) {
    animationFrameId = null;
    if (gameStatus !== "running" || document.hidden) {
      return;
    }

    const deltaSeconds = Math.min((now - lastTick) / 1000, 0.05);
    lastTick = now;
    updateDropGuide(deltaSeconds);
    physicsAccumulator += deltaSeconds;

    let steps = 0;
    while (physicsAccumulator >= FIXED_TIMESTEP && steps < MAX_STEPS) {
      simulateStep(FIXED_TIMESTEP, now);
      physicsAccumulator -= FIXED_TIMESTEP;
      steps += 1;
    }

    if (steps === MAX_STEPS) {
      physicsAccumulator = 0;
    }

    fruits = physicsBodies.map((fruit) => ({ ...fruit }));

    if (physicsBodies.some((fruit) => fruit.y - fruit.radius < DROP_LINE_Y - 12)) {
      overflowMs += deltaSeconds * 1000;
    } else {
      overflowMs = Math.max(0, overflowMs - deltaSeconds * 2200);
    }

    if (overflowMs > 1200) {
      gameStatus = "over";
      stopLoop();
      return;
    }

    animationFrameId = requestAnimationFrame(loop);
  }

  async function fetchRanking() {
    isRankingLoading = true;
    rankingError = "";

    try {
      const data = await loadRankingList(GAME_CODE, 5);
      rankings = data.rankings as SuikaRankingItem[];
    } catch (error) {
      rankings = [];
      rankingError = "랭킹을 불러오지 못했습니다.";
      console.error(error);
    } finally {
      isRankingLoading = false;
    }
  }

  async function submitScore() {
    if (gameStatus !== "over" || isSubmitting || !userName.trim()) {
      return;
    }

    isSubmitting = true;
    submitMessage = "";

    const payload: SuikaScoreRequest = {
      userName: userName.trim(),
      gameName: GAME_NAME,
      gameCode: GAME_CODE,
      score,
    };

    try {
      await createRanking(payload);
      await fetchRanking();
      resetGame();
    } catch (error) {
      submitMessage = "기록 저장에 실패했습니다.";
      console.error(error);
    } finally {
      isSubmitting = false;
    }
  }

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

    if (event.code === "Space") {
      event.preventDefault();

      if (gameStatus === "idle") {
        startGame();
      } else if (gameStatus === "running") {
        dropFruit();
      }
    }

    if (gameStatus !== "running") {
      return;
    }

    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "a", "d", "ㅁ", "ㅇ"].includes(key)) {
      event.preventDefault();
      pressedKeys.add(key);
    }
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

  function invalidateBoardRect() { boardRect = null; }
  function releaseControls() { pressedKeys.clear(); }
  function handleVisibility() {
    releaseControls();
    stopLoop();
    if (guideFrame !== null) cancelAnimationFrame(guideFrame);
    guideFrame = null;
    if (!document.hidden && gameStatus === "running") {
      lastTick = performance.now();
      physicsAccumulator = 0;
      animationFrameId = requestAnimationFrame(loop);
    }
  }
  function onPointerMove(event: PointerEvent) {
    if (gameStatus !== "running") return;
    pointerClientX = event.clientX;
    const element = event.currentTarget as HTMLElement;
    if (guideFrame !== null) return;
    guideFrame = requestAnimationFrame(() => {
      guideFrame = null;
      if (gameStatus !== "running") return;
      boardRect ??= element.getBoundingClientRect();
      setDropFromPointer(pointerClientX, boardRect);
    });
  }
  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    if (gameStatus === "idle") { startGame(); return; }
    if (gameStatus !== "running") return;
    boardRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setDropFromPointer(event.clientX, boardRect);
    dropFruit();
  }
  function onBoardKeyDown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (gameStatus === "idle") startGame();
    else if (gameStatus === "running") dropFruit();
  }
  $effect(() => {
    if (!boardViewport) return;
    const observer = new ResizeObserver(([entry]) => {
      boardScale = Math.min(1, entry.contentRect.width / BOARD_WIDTH);
      invalidateBoardRect();
    });
    observer.observe(boardViewport);
    return () => observer.disconnect();
  });

  onMount(() => {
    fetchRanking();
    resetGame();
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseControls);
    window.addEventListener("scroll", invalidateBoardRect, true);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopLoop();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseControls);
      window.removeEventListener("scroll", invalidateBoardRect, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (guideFrame !== null) cancelAnimationFrame(guideFrame);
    };
  });
</script>

<svelte:head><title>수박게임 · 장난감 웹</title></svelte:head>

<section class="suika-page">
  <header class="game-heading">
    <div><h1>수박게임</h1><p>같은 숫자를 합쳐 더 큰 숫자를 만드세요.</p></div>
    <span class="game-status">{gameStatus === "running" ? "플레이 중" : gameStatus === "over" ? "게임 종료" : "시작 대기"}</span>
  </header>
  <div class="game-layout">
    <article class="board-card">
      <div class="board-toolbar">
        <div class="score"><span>현재 점수</span><strong>{Number(scoreLabel).toLocaleString("ko-KR")}</strong></div>
        <div class="next-preview"><span>다음 숫자</span><div class="next-ball" style={`background:${previewFruit.color};`}>{previewFruit.name}</div></div>
      </div>
      <div class="board-viewport" bind:this={boardViewport}>
        <div class="board" style={`transform:scale(${boardScale});`} onpointermove={onPointerMove} onpointerdown={onPointerDown} onkeydown={onBoardKeyDown} role="button" tabindex="0" aria-label="수박게임 보드. 좌우 방향키로 이동하고 스페이스 또는 Enter로 떨어뜨리기">
          <div class="danger-line" aria-hidden="true"></div>
          <div class="drop-guide" style={`transform:translateX(${dropX}px);`}>
            <div class="preview-ball" style={`width:${nextFruit.radius * 2}px;height:${nextFruit.radius * 2}px;background:${nextFruit.color};`}><span>{nextFruit.name}</span></div>
          </div>
          {#each fruits as fruit (fruit.id)}
            {@const definition = fruitDefinitions[fruit.level]}
            <div class="fruit" style={`width:${fruit.radius * 2}px;height:${fruit.radius * 2}px;transform:translate(${fruit.x - fruit.radius}px,${fruit.y - fruit.radius}px);background:${definition.color};`}><span>{definition.name}</span></div>
          {/each}
        </div>
        {#if gameStatus !== "running"}
          <div class="overlay">
            <div class="overlay-panel">
              <h2>{gameStatus === "over" ? "게임 종료" : "어디까지 합칠 수 있을까요?"}</h2>
              <p>{gameStatus === "over" ? `최종 점수 ${score.toLocaleString("ko-KR")}점. 기록을 남겨 보세요.` : "숫자를 떨어뜨려 같은 숫자끼리 만나게 해 보세요."}</p>
              {#if gameStatus === "over"}
                <form onsubmit={(event) => { event.preventDefault(); void submitScore(); }}>
                  <label class="name-field"><span>기록에 남길 이름</span><input bind:value={userName} maxlength="20" placeholder="이름 입력" disabled={isSubmitting} /></label>
                  <button type="submit" class="game-action" disabled={!userName.trim() || isSubmitting}>{isSubmitting ? "저장 중" : "기록 저장"}</button>
                </form>
                {#if submitMessage}<p class="submit-message" role="alert">{submitMessage}</p>{/if}
              {/if}
              <button type="button" class="game-action" class:secondary={gameStatus === "over"} onclick={startGame} disabled={isSubmitting}>{gameStatus === "over" ? "다시 시작" : "게임 시작"}</button>
            </div>
          </div>
        {/if}
      </div>
      <div class="game-rules"><p><strong>이동</strong> 마우스 또는 좌우 방향키</p><p><strong>떨어뜨리기</strong> 터치 · 클릭 · <kbd>Space</kbd></p></div>
    </article>
    <aside class="side-panel">
      <section class="ranking-card">
        <header><h2>게임 랭킹</h2><span>상위 5명</span></header>
        <p class="best-score">최고 기록 <strong>{bestRankingScore.toLocaleString("ko-KR")}점</strong></p>
        {#if isRankingLoading}<p class="ranking-empty" role="status">기록을 불러오는 중입니다.</p>
        {:else if rankingError}<div class="ranking-error" role="alert"><p>{rankingError}</p><button type="button" class="game-action secondary" onclick={() => void fetchRanking()}>다시 시도</button></div>
        {:else if !rankings.length}<p class="ranking-empty">아직 등록된 기록이 없어요.<br />첫 기록에 도전해 보세요.</p>
        {:else}<ol class="ranking-list">{#each rankings as ranking}<li><span>{ranking.rank}</span><strong title={ranking.userName}>{ranking.userName}</strong><span>{ranking.score.toLocaleString("ko-KR")}</span></li>{/each}</ol>{/if}
      </section>
      <section class="evolution-card">
        <h2>숫자의 성장</h2><p>도달한 최고 단계 <strong>{fruitDefinitions[bestLevel].name}</strong></p>
        <ol class="evolution-list">{#each fruitDefinitions as definition}<li class:reached={bestLevel >= definition.level} style={`--fruit-color:${definition.color};`} aria-label={`${definition.name}단계${bestLevel >= definition.level ? ", 도달" : ""}`}>{definition.name}</li>{/each}</ol>
      </section>
    </aside>
  </div>
</section>

<style>
  .game-layout { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 16px; align-items: start; }
  .board-card, .ranking-card, .evolution-card { min-width: 0; padding: 24px; border-radius: var(--panel-radius); background: var(--surface); }
  .board-card { display: grid; gap: 20px; justify-items: center; }
  .board-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; width: min(100%, 430px); }
  .score { display: grid; gap: 4px; }
  .score > span, .next-preview > span { color: var(--muted); font-size: 12px; }
  .score strong { color: var(--brand-strong); font-size: 32px; font-weight: 500; font-variant-numeric: tabular-nums; line-height: 1.3; }
  .next-preview { display: flex; align-items: center; gap: 10px; }
  .next-ball { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: #242124; font-weight: 600; font-variant-numeric: tabular-nums; }
  .board-viewport { position: relative; width: min(100%, 430px); aspect-ratio: 43 / 56; overflow: hidden; border-radius: 12px; background: var(--surface-muted); }
  .board { position: absolute; top: 0; left: 0; width: 430px; height: 560px; transform-origin: top left; contain: layout paint; cursor: crosshair; touch-action: none; user-select: none; border-radius: 0 0 12px 12px; }
  .board::after { content: ""; position: absolute; inset: 0; border: 2px solid var(--line-strong); border-top: 0; border-radius: inherit; pointer-events: none; }
  .danger-line { position: absolute; top: 74px; left: 14px; right: 14px; border-top: 1px dashed var(--danger); opacity: 0.6; pointer-events: none; }
  .drop-guide { position: absolute; top: 16px; left: 0; pointer-events: none; }
  .preview-ball, .fruit { display: grid; place-items: center; border-radius: 50%; color: #242124; font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; border: 1px solid rgba(0,0,0,0.12); }
  .preview-ball { transform: translateX(-50%); }
  .fruit { position: absolute; top: 0; left: 0; }
  .overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--bg) 86%, transparent); }
  .overlay-panel { display: grid; gap: 14px; width: min(100%, 340px); max-height: 100%; overflow-y: auto; padding: 24px; border-radius: 12px; background: var(--surface); }
  .overlay-panel h2, .overlay-panel p { margin: 0; }
  .overlay-panel h2 { color: var(--text-strong); font-size: 20px; line-height: 1.4; }
  .overlay-panel p { color: var(--muted); font-size: 13px; line-height: 1.7; }
  .overlay-panel form, .name-field { display: grid; gap: 8px; }
  .name-field { font-size: 12px; color: var(--muted); }
  .name-field input { width: 100%; min-width: 0; height: 44px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--control-radius); background: var(--surface-muted); color: var(--text); }
  .overlay-panel .submit-message { color: var(--danger); }
  .side-panel { display: grid; gap: 16px; min-width: 0; }
  .ranking-card header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .ranking-card h2, .evolution-card h2 { margin: 0; color: var(--text-strong); font-size: 16px; font-weight: 650; }
  .ranking-card header > span { color: var(--muted); font-size: 11px; }
  .best-score { display: flex; justify-content: space-between; gap: 12px; margin: 16px 0; color: var(--muted); font-size: 12px; }
  .best-score strong { color: var(--text); font-weight: 500; font-variant-numeric: tabular-nums; }
  .ranking-empty, .ranking-error { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.8; }
  .ranking-error p { margin: 0 0 12px; }
  .ranking-list { list-style: none; margin: 0; padding: 0; }
  .ranking-list li { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; gap: 10px; align-items: center; min-height: 44px; font-size: 13px; }
  .ranking-list strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .ranking-list span { font-variant-numeric: tabular-nums; color: var(--muted); }
  .ranking-list span:last-child { color: var(--text-strong); text-align: right; }
  .ranking-list li:first-child span { color: var(--brand-strong); }
  .evolution-card > p { margin: 12px 0 16px; color: var(--muted); font-size: 12px; }
  .evolution-card > p strong { color: var(--text); margin-left: 4px; }
  .evolution-list { list-style: none; display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 12px 8px; margin: 0; padding: 0; }
  .evolution-list li { display: grid; place-items: center; aspect-ratio: 1; border: 1px solid var(--line-strong); border-radius: 50%; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .evolution-list li.reached { background: var(--fruit-color); border-color: transparent; color: #242124; font-weight: 600; }
  @media (max-width: 850px) { .game-layout { grid-template-columns: 1fr; } .side-panel { grid-template-columns: repeat(2, minmax(0,1fr)); align-items: start; } }
  @media (max-width: 540px) { .board-card, .ranking-card, .evolution-card { padding: 16px; } .side-panel { grid-template-columns: 1fr; } .overlay-panel { padding: 20px; } .overlay-panel h2 { font-size: 18px; } }
</style>
