<script lang="ts">
  import { onMount } from "svelte";
  import fruitDefs from "$lib/assets/data/suika/fruits.json";
  import type {
    SuikaFruitDefinition,
    SuikaRankingItem,
    SuikaScoreRequest,
  } from "$lib";

  type GameStatus = "idle" | "running" | "over";
  type FruitBody = {
    id: number;
    level: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    mergedAt: number;
  };

  const GAME_NAME = "수박게임";
  const GAME_CODE = 200;
  const BOARD_WIDTH = 430;
  const BOARD_HEIGHT = 560;
  const DROP_LINE_Y = 74;
  const GRAVITY = 1800;
  const RESTITUTION = 0.14;
  const FRICTION = 0.996;
  const FIXED_TIMESTEP = 1 / 120;
  const MAX_STEPS = 6;
  const DROP_MOVE_SPEED = 520;
  const STARTER_MAX_LEVEL = 4;
  const WALL_PADDING = 14;
  const fruitDefinitions = fruitDefs as SuikaFruitDefinition[];

  let gameStatus = $state<GameStatus>("idle");
  let fruits = $state<FruitBody[]>([]);
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
    fruits = [];
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
    resetGame();
    gameStatus = "running";
    lastTick = performance.now();
    physicsAccumulator = 0;
    animationFrameId = requestAnimationFrame(loop);
  }

  function setDropFromPointer(clientX: number, rect: DOMRect) {
    const localX = clientX - rect.left;
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
    fruits = [
      ...fruits,
      {
        id: fruitId++,
        level: nextLevel,
        x: clamp(dropX, radius + WALL_PADDING, BOARD_WIDTH - radius - WALL_PADDING),
        y: DROP_LINE_Y,
        vx: 0,
        vy: 0,
        radius,
        mergedAt: 0,
      },
    ];
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
    const bodies = fruits.map((fruit) => {
      const vy = fruit.vy + GRAVITY * deltaSeconds;
      return {
        ...fruit,
        vx: fruit.vx,
        vy,
        x: fruit.x + fruit.vx * deltaSeconds,
        y: fruit.y + vy * deltaSeconds,
      };
    });
    const mergeCandidates = new Set<string>();

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
          const distance = Math.hypot(dx, dy) || 0.0001;
          const minDistance = a.radius + b.radius;

          if (distance >= minDistance) {
            continue;
          }

          if (
            a.level === b.level &&
            a.level < fruitDefinitions.length - 1 &&
            now - a.mergedAt > 120 &&
            now - b.mergedAt > 120
          ) {
            const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
            mergeCandidates.add(pairKey);
          }

          const nx = dx / distance;
          const ny = dy / distance;
          const overlap = minDistance - distance + 0.15;
          const correction = overlap / 2;

          a.x -= nx * correction;
          a.y -= ny * correction;
          b.x += nx * correction;
          b.y += ny * correction;

          const relativeVx = b.vx - a.vx;
          const relativeVy = b.vy - a.vy;
          const separatingVelocity = relativeVx * nx + relativeVy * ny;

          if (separatingVelocity < 0) {
            const impulse = (-(1 + RESTITUTION) * separatingVelocity) / 2;
            a.vx -= nx * impulse;
            a.vy -= ny * impulse;
            b.vx += nx * impulse;
            b.vy += ny * impulse;
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

    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i];
        const b = bodies[j];

        if (
          mergedIds.has(a.id) ||
          mergedIds.has(b.id) ||
          a.level !== b.level ||
          a.level >= fruitDefinitions.length - 1 ||
          now - a.mergedAt <= 120 ||
          now - b.mergedAt <= 120
        ) {
          continue;
        }

        const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if (!mergeCandidates.has(pairKey)) {
          continue;
        }

        mergedIds.add(a.id);
        mergedIds.add(b.id);

        const next = fruitDefinitions[a.level + 1];
        const anchor = a.y >= b.y ? a : b;
        additions.push({
          id: fruitId++,
          level: next.level,
          x: clamp(anchor.x, next.radius + WALL_PADDING, BOARD_WIDTH - next.radius - WALL_PADDING),
          y: clamp(anchor.y, next.radius + WALL_PADDING, BOARD_HEIGHT - next.radius - WALL_PADDING),
          vx: (anchor.vx + (anchor === a ? b.vx : a.vx) * 0.35) / 1.35,
          vy: Math.min((a.vy + b.vy) / 2, -70),
          radius: next.radius,
          mergedAt: now,
        });
        score += next.score;
        bestLevel = Math.max(bestLevel, next.level);
      }
    }

    fruits = [...bodies.filter((fruit) => !mergedIds.has(fruit.id)), ...additions];
  }

  function loop(now: number) {
    if (gameStatus !== "running") {
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

    if (fruits.some((fruit) => fruit.y - fruit.radius < DROP_LINE_Y - 12)) {
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

  function normalizeRankingItem(item: unknown, index: number): SuikaRankingItem | null {
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
        .filter((item): item is SuikaRankingItem => item !== null);
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
      .filter((item): item is SuikaRankingItem => item !== null);
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
        target.isContentEditable)
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

  function onPointerMove(event: PointerEvent) {
    if (gameStatus !== "running") {
      return;
    }

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setDropFromPointer(event.clientX, rect);
  }

  function onPointerDown(event: PointerEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setDropFromPointer(event.clientX, rect);

    if (gameStatus === "idle") {
      startGame();
      return;
    }

    if (gameStatus === "running") {
      dropFruit();
    }
  }

  onMount(() => {
    fetchRanking();
    resetGame();
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
  <title>수박게임</title>
</svelte:head>

<section class="suika-page">
  <h1>수박게임</h1>

  <div class="stage-shell">
    <div class="stage">
      <aside class="side-panel left-panel">
        <section class="bubble score-bubble">
          <p class="bubble-label">득점</p>
          <strong>{scoreLabel}</strong>
          <p class="bubble-sub">BEST SCORE {bestRankingScore}</p>
        </section>

        <section class="ranking-board">
          <div class="ranking-board-head">
            <p>오늘의 순위</p>
            <button type="button" class="tiny-btn" onclick={fetchRanking}>R</button>
          </div>

          {#if isRankingLoading}
            <p class="ranking-empty">불러오는 중...</p>
          {:else if rankingError}
            <p class="ranking-empty">{rankingError}</p>
          {:else if !rankings.length}
            <p class="ranking-empty">아직 기록이 없습니다.</p>
          {:else}
            <ol class="ranking-strip">
              {#each rankings as ranking, index}
                <li class:index-top={index < 3}>
                  <span class="medal">#{ranking.rank}</span>
                  <strong>{ranking.userName}</strong>
                  <span>{ranking.score}</span>
                </li>
              {/each}
            </ol>
          {/if}
        </section>
      </aside>

      <article class="board-frame">
        <div
          class="board"
          onpointermove={onPointerMove}
          onpointerdown={onPointerDown}
          role="button"
          tabindex="0"
          aria-label="수박게임 보드"
        >
          <div class="board-sky"></div>
          <div class="danger-line"></div>
          <div class="glass-edge glass-top"></div>
          <div class="glass-edge glass-left"></div>
          <div class="glass-edge glass-right"></div>
          <div class="glass-edge glass-bottom"></div>

          <div class="drop-guide" style={`left:${dropX}px;`}>
            <div
              class="preview-ball"
              style={`width:${nextFruit.radius * 2}px;height:${nextFruit.radius * 2}px;background:${nextFruit.color};`}
            >
              <span>{nextFruit.name}</span>
            </div>
          </div>

          {#each fruits as fruit (fruit.id)}
            {@const definition = fruitDefinitions[fruit.level]}
            <div
              class="fruit"
              style={`width:${fruit.radius * 2}px;height:${fruit.radius * 2}px;transform: translate(${fruit.x - fruit.radius}px, ${fruit.y - fruit.radius}px);background:${definition.color};`}
            >
              <span>{definition.name}</span>
            </div>
          {/each}

          {#if gameStatus !== "running"}
            <div class="overlay">
              <div class="overlay-panel">
                <h2>{gameStatus === "over" ? "게임 오버" : "클릭 또는 스페이스로 시작"}</h2>
                <p>
                  {gameStatus === "over"
                    ? `점수 ${score}점. 이름을 입력하면 랭킹에 저장됩니다.`
                    : "같은 숫자를 붙여 더 큰 숫자로 만드세요."}
                </p>

                {#if gameStatus === "over"}
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
                    {isSubmitting ? "저장 중..." : "기록 저장"}
                  </button>
                  {#if submitMessage}
                    <p class="submit-message">{submitMessage}</p>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </article>

      <aside class="side-panel right-panel">
        <section class="bubble next-bubble">
          <p class="bubble-label">다음</p>
          <div
            class="next-ball"
            style={`width:${previewFruit.radius * 1.55}px;height:${previewFruit.radius * 1.55}px;background:${previewFruit.color};`}
          >
            <span>{previewFruit.name}</span>
          </div>
        </section>

        <section class="evolution-card">
          <p class="evolution-title">진화의 고리</p>
          <div class="evolution-ring">
            {#each fruitDefinitions as definition, index}
              <div
                class={`ring-fruit ${bestLevel >= definition.level ? "active" : ""}`}
                style={`--angle:${index * (360 / fruitDefinitions.length)}deg;--fruit-color:${definition.color};--ring-size:${Math.max(24, Math.round(definition.radius * 0.38))}px;`}
              >
                <span>{definition.name}</span>
              </div>
            {/each}
          </div>
          <p class="evolution-foot">최고 단계 {fruitDefinitions[bestLevel].name}</p>
        </section>
      </aside>
    </div>
  </div>
</section>

<style>
  .suika-page {
    display: grid;
    gap: 10px;
    color: #4a321d;
  }

  h1 {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
  }

  .stage-shell {
    overflow-x: auto;
    padding-bottom: 8px;
  }

  .stage {
    position: relative;
    width: 1024px;
    height: 768px;
    display: grid;
    grid-template-columns: 214px 1fr 214px;
    gap: 20px;
    padding: 24px 22px 18px;
    box-sizing: border-box;
    border-radius: 28px;
    background:
      radial-gradient(circle at 50% -10%, rgba(255, 242, 191, 0.38), transparent 28%),
      linear-gradient(180deg, #c7955d 0%, #b07a47 55%, #d6bb87 55%, #e9d7ae 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 22px 44px rgba(86, 52, 22, 0.16);
  }

  .side-panel {
    display: grid;
    align-content: start;
    gap: 18px;
    padding-top: 10px;
  }

  .bubble,
  .ranking-board,
  .evolution-card {
    position: relative;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.42), rgba(255, 245, 230, 0.18) 42%, rgba(255, 228, 194, 0.12) 100%);
    border: 2px solid rgba(255, 241, 219, 0.46);
    box-shadow:
      inset 0 10px 24px rgba(255, 255, 255, 0.18),
      inset 0 -12px 24px rgba(161, 104, 52, 0.1),
      0 18px 26px rgba(113, 71, 34, 0.1);
  }

  .score-bubble,
  .next-bubble {
    width: 172px;
    height: 172px;
    justify-self: center;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 14px;
    box-sizing: border-box;
  }

  .bubble-label {
    margin: 0;
    font-size: 28px;
    font-weight: 900;
    color: #fff8e9;
    text-shadow: 0 2px 0 rgba(104, 64, 23, 0.28);
  }

  .score-bubble strong {
    display: block;
    margin-top: -8px;
    font-size: 54px;
    line-height: 1;
    color: #fff9ef;
    text-shadow: 0 4px 0 rgba(103, 57, 16, 0.22);
  }

  .bubble-sub {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: rgba(255, 249, 237, 0.92);
  }

  .ranking-board {
    width: 184px;
    min-height: 280px;
    justify-self: center;
    border-radius: 26px;
    padding: 12px 10px 14px;
    box-sizing: border-box;
    background: linear-gradient(180deg, rgba(255, 253, 244, 0.88) 0%, rgba(246, 230, 196, 0.76) 100%);
  }

  .ranking-board-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .ranking-board-head p {
    margin: 0;
    font-size: 18px;
    font-weight: 900;
    color: #9d6c34;
  }

  .tiny-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.66);
    color: #8f6633;
    font-weight: 900;
    cursor: pointer;
  }

  .ranking-strip {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .ranking-strip li {
    display: grid;
    grid-template-columns: 46px 1fr auto;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    border-radius: 12px;
    padding: 0 8px;
    background: rgba(255, 255, 255, 0.56);
    color: #7b552b;
    font-weight: 800;
  }

  .ranking-strip li.index-top {
    background: linear-gradient(90deg, rgba(255, 228, 151, 0.74), rgba(193, 227, 255, 0.62));
  }

  .medal {
    display: inline-grid;
    place-items: center;
    height: 26px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.74);
    font-size: 12px;
  }

  .ranking-empty {
    margin: 0;
    color: #8b673f;
    font-size: 14px;
  }

  .board-frame {
    display: grid;
    justify-items: center;
    align-content: start;
    padding-top: 22px;
  }

  .board {
    position: relative;
    width: 430px;
    height: 560px;
    overflow: hidden;
    border-radius: 8px 8px 18px 18px;
    background:
      linear-gradient(180deg, rgba(255, 250, 220, 0.28) 0%, rgba(255, 249, 229, 0.18) 100%),
      linear-gradient(180deg, rgba(255, 246, 208, 0.14) 0%, rgba(255, 233, 188, 0.18) 100%);
    box-shadow:
      inset 0 0 0 3px rgba(255, 231, 162, 0.5),
      inset 0 0 0 8px rgba(255, 245, 222, 0.16),
      0 16px 30px rgba(111, 71, 31, 0.14);
    cursor: crosshair;
    user-select: none;
  }

  .board-sky {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 243, 214, 0.04) 100%),
      linear-gradient(90deg, transparent 49.5%, rgba(255, 255, 255, 0.22) 50%, transparent 50.5%);
  }

  .glass-edge {
    position: absolute;
    background: linear-gradient(180deg, rgba(255, 233, 167, 0.9), rgba(244, 202, 104, 0.8));
    box-shadow: 0 0 0 1px rgba(255, 252, 238, 0.24);
  }

  .glass-top {
    left: 0;
    top: 0;
    width: 100%;
    height: 12px;
  }

  .glass-left,
  .glass-right {
    top: 0;
    width: 12px;
    height: 100%;
  }

  .glass-left {
    left: 0;
  }

  .glass-right {
    right: 0;
  }

  .glass-bottom {
    left: 0;
    bottom: 0;
    width: 100%;
    height: 14px;
  }

  .danger-line {
    position: absolute;
    left: 18px;
    right: 18px;
    top: 74px;
    border-top: 2px solid rgba(255, 255, 255, 0.42);
  }

  .drop-guide {
    position: absolute;
    top: 18px;
    transform: translateX(-50%);
    pointer-events: none;
    transition: left 0.06s linear;
  }

  .preview-ball,
  .fruit,
  .next-ball {
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: rgba(54, 32, 13, 0.84);
    font-size: 12px;
    font-weight: 900;
    box-shadow:
      inset -8px -12px 18px rgba(0, 0, 0, 0.08),
      inset 10px 12px 20px rgba(255, 255, 255, 0.26),
      0 10px 16px rgba(101, 55, 14, 0.12);
    border: 2px solid rgba(255, 255, 255, 0.48);
  }

  .preview-ball,
  .next-ball {
    position: relative;
  }

  .preview-ball span,
  .fruit span,
  .next-ball span {
    text-align: center;
    padding: 0 6px;
    line-height: 1.1;
  }

  .fruit {
    position: absolute;
    will-change: transform;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(96, 61, 28, 0.18);
    backdrop-filter: blur(3px);
  }

  .overlay-panel {
    width: min(320px, calc(100% - 28px));
    display: grid;
    gap: 10px;
    padding: 18px;
    border-radius: 20px;
    background: rgba(255, 251, 245, 0.95);
    color: #3a2615;
    box-shadow: 0 20px 36px rgba(76, 40, 12, 0.14);
  }

  .overlay-panel h2,
  .overlay-panel p {
    margin: 0;
  }

  .name-field {
    display: grid;
    gap: 6px;
    font-weight: 700;
    font-size: 14px;
  }

  .name-field input {
    height: 40px;
    border-radius: 12px;
    border: 1px solid #e7cfbc;
    background: #fff;
    padding: 0 12px;
    font: inherit;
  }

  .submit-btn {
    height: 42px;
    border: none;
    border-radius: 999px;
    color: #fffaf0;
    background: linear-gradient(135deg, #d97706 0%, #c2410c 100%);
    font-weight: 700;
    cursor: pointer;
  }

  .submit-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .submit-message {
    color: #b91c1c;
    font-size: 13px;
  }

  .right-panel {
    display: grid;
    justify-items: center;
  }

  .next-ball {
    width: 70px;
    height: 70px;
  }

  .evolution-card {
    width: 196px;
    height: 250px;
    border-radius: 34px;
    padding: 14px 10px;
    box-sizing: border-box;
    display: grid;
    justify-items: center;
    align-content: start;
    background: linear-gradient(180deg, rgba(243, 255, 221, 0.88) 0%, rgba(216, 243, 181, 0.66) 100%);
  }

  .evolution-title,
  .evolution-foot {
    margin: 0;
    color: #8d6d2b;
    font-weight: 900;
  }

  .evolution-title {
    font-size: 20px;
  }

  .evolution-foot {
    margin-top: 10px;
    font-size: 13px;
  }

  .evolution-ring {
    position: relative;
    width: 168px;
    height: 168px;
    margin-top: 8px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.52) 0 28%, rgba(215, 246, 171, 0.36) 29%, rgba(255, 255, 255, 0) 30%);
  }

  .ring-fruit {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--ring-size);
    height: var(--ring-size);
    margin-left: calc(var(--ring-size) / -2);
    margin-top: calc(var(--ring-size) / -2);
    border-radius: 999px;
    transform:
      rotate(var(--angle))
      translateY(-76px)
      rotate(calc(var(--angle) * -1));
    display: grid;
    place-items: center;
    background: var(--fruit-color);
    border: 2px solid rgba(255, 255, 255, 0.68);
    box-shadow: 0 8px 12px rgba(104, 94, 28, 0.12);
    color: rgba(58, 39, 17, 0.84);
    font-size: 8px;
    font-weight: 900;
    opacity: 0.72;
  }

  .ring-fruit.active {
    opacity: 1;
    transform:
      rotate(var(--angle))
      translateY(-76px)
      rotate(calc(var(--angle) * -1))
      scale(1.04);
  }

  @media (max-width: 860px) {
    .stage-shell {
      overflow-x: auto;
    }
  }
</style>
