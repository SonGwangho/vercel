<script lang="ts">
	import { onMount, tick } from "svelte";
	import { requireGameCode } from "$lib/gameCodes";
	import type {
		ByulnanbayaFieldUnit,
		ByulnanbayaStatus,
		ByulnanbayaUnitDefinition,
		RankingListItem,
		RankingListResponse
	} from "$lib";

	type GemKind = "ruby" | "sun" | "leaf" | "wave" | "violet";
	type Gem = {
		id: number;
		kind: GemKind;
	};
	type SwipeStart = {
		index: number;
		x: number;
		y: number;
	};
	type SwapMotion = {
		from: number;
		to: number;
		dx: number;
		dy: number;
	};

	const BOARD_COLS = 7;
	const BOARD_ROWS = 4;
	const FIELD_HEIGHT = 1480;
	const CASTLE_Y = 70;
	const ALLY_SPAWN_Y = FIELD_HEIGHT - 80;
	const ENEMY_SPAWN_Y = 190;
	const CASTLE_MAX_HP = 960;
	const GEM_SCORE = 20;
	const ENEMY_SPAWN_SECONDS = 6.2;
	const MAX_ENEMIES = 8;
	const LANE_OFFSETS = [-64, -32, 0, 32, 64];
	const RANKING_LIMIT = 10;
	const gameMeta = requireGameCode("byulnanbaya");
	const GAME_CODE = gameMeta.gameCode;

	const gemKinds: GemKind[] = ["ruby", "sun", "leaf", "wave", "violet"];
	const gemLabel: Record<GemKind, string> = {
		ruby: "붉은별",
		sun: "햇조각",
		leaf: "잎구슬",
		wave: "물방울",
		violet: "보라빛"
	};

	const unitDefs: ByulnanbayaUnitDefinition[] = [
		{ id: "bolt", name: "번쩍이", cost: 100, hp: 110, attack: 18, speed: 38, color: "#60a5fa" },
		{ id: "guard", name: "단단이", cost: 155, hp: 190, attack: 13, speed: 27, color: "#34d399" },
		{ id: "mage", name: "별술사", cost: 205, hp: 95, attack: 28, speed: 33, color: "#c084fc" },
		{ id: "ranger", name: "초승궁", cost: 245, hp: 125, attack: 34, speed: 36, color: "#f59e0b" },
		{ id: "giant", name: "바야왕", cost: 340, hp: 320, attack: 38, speed: 22, color: "#f472b6" }
	];

	const enemyDefs = unitDefs.map((unit) => ({
		...unit,
		hp: Math.round(unit.hp * 0.85),
		attack: Math.round(unit.attack * 0.78),
		speed: Math.round(unit.speed * 0.95)
	}));

	let status = $state<ByulnanbayaStatus>("ready");
	let currency = $state(100);
	let castleHp = $state(CASTLE_MAX_HP);
	let units = $state<ByulnanbayaFieldUnit[]>([]);
	let board = $state<Gem[]>([]);
	let matchedIndexes = $state(new Set<number>());
	let fallingIndexes = $state(new Set<number>());
	let isExpanded = $state(false);
	let isResolving = $state(false);
	let isSwapping = $state(false);
	let followUnits = $state(true);
	let gemId = 1;
	let unitId = 1;
	let loopHandle: number | null = null;
	let lastFrame = 0;
	let enemySpawnElapsed = 0;
	let gameStartTime = 0;
	let clearTimeMs = $state<number | null>(null);
	let rankings = $state<RankingListItem[]>([]);
	let rankingLoading = $state(false);
	let rankingError = $state("");
	let rankingModalOpen = $state(false);
	let submittingRecord = $state(false);
	let recordSubmitted = $state(false);
	let followResumeHandle: ReturnType<typeof setTimeout> | null = null;
	let fieldScroller: HTMLDivElement | null = null;
	let swipeStart: SwipeStart | null = null;
	let swapMotion = $state<SwapMotion | null>(null);

	const castleHpPercent = $derived(Math.max(0, (castleHp / CASTLE_MAX_HP) * 100));

	function wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function formatClearTime(ms: number) {
		const totalCentiseconds = Math.max(0, Math.round(ms / 10));
		const minutes = Math.floor(totalCentiseconds / 6000);
		const seconds = Math.floor((totalCentiseconds % 6000) / 100);
		const centiseconds = totalCentiseconds % 100;

		return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
	}

	function rankingScoreFromTime(ms: number) {
		return -Math.max(0, Math.round(ms));
	}

	function rankingTime(ranking: RankingListItem) {
		return formatClearTime(Math.abs(ranking.score));
	}

	async function loadRankings() {
		rankingLoading = true;
		rankingError = "";

		try {
			const response = await fetch(`/api/rankings?gameCode=${GAME_CODE}&limit=${RANKING_LIMIT}`);
			if (!response.ok) {
				throw new Error("랭킹을 불러오지 못했습니다.");
			}

			const data = (await response.json()) as RankingListResponse;
			rankings = data.rankings;
		} catch (error) {
			rankingError = error instanceof Error ? error.message : "랭킹을 불러오지 못했습니다.";
		} finally {
			rankingLoading = false;
		}
	}

	async function submitClearRecord() {
		if (clearTimeMs === null || submittingRecord || recordSubmitted) {
			return;
		}

		submittingRecord = true;
		rankingError = "";

		try {
			const response = await fetch("/api/rankings", {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					gameCode: GAME_CODE,
					gameName: gameMeta.gameName,
					userName: "익명",
					score: rankingScoreFromTime(clearTimeMs)
				})
			});

			if (!response.ok) {
				throw new Error("기록 등록에 실패했습니다.");
			}

			recordSubmitted = true;
			await loadRankings();
		} catch (error) {
			rankingError = error instanceof Error ? error.message : "기록 등록에 실패했습니다.";
		} finally {
			submittingRecord = false;
		}
	}

	function openRankingModal() {
		rankingModalOpen = true;
		void loadRankings();
	}

	function randomGem(): Gem {
		return {
			id: gemId++,
			kind: gemKinds[Math.floor(Math.random() * gemKinds.length)]
		};
	}

	function indexOf(row: number, col: number) {
		return row * BOARD_COLS + col;
	}

	function rowOf(index: number) {
		return Math.floor(index / BOARD_COLS);
	}

	function colOf(index: number) {
		return index % BOARD_COLS;
	}

	function neighborIndex(index: number, dx: number, dy: number) {
		const row = rowOf(index) + dy;
		const col = colOf(index) + dx;

		if (row < 0 || row >= BOARD_ROWS || col < 0 || col >= BOARD_COLS) {
			return null;
		}

		return indexOf(row, col);
	}

	function findMatches(source: Gem[]) {
		const matched = new Set<number>();

		for (let row = 0; row < BOARD_ROWS; row += 1) {
			let start = 0;
			for (let col = 1; col <= BOARD_COLS; col += 1) {
				const current = col < BOARD_COLS ? source[indexOf(row, col)]?.kind : null;
				const previous = source[indexOf(row, col - 1)]?.kind;
				if (current !== previous) {
					if (col - start >= 3) {
						for (let c = start; c < col; c += 1) matched.add(indexOf(row, c));
					}
					start = col;
				}
			}
		}

		for (let col = 0; col < BOARD_COLS; col += 1) {
			let start = 0;
			for (let row = 1; row <= BOARD_ROWS; row += 1) {
				const current = row < BOARD_ROWS ? source[indexOf(row, col)]?.kind : null;
				const previous = source[indexOf(row - 1, col)]?.kind;
				if (current !== previous) {
					if (row - start >= 3) {
						for (let r = start; r < row; r += 1) matched.add(indexOf(r, col));
					}
					start = row;
				}
			}
		}

		return matched;
	}

	function hasPossibleMove(source: Gem[]) {
		for (let index = 0; index < source.length; index += 1) {
			for (const [dx, dy] of [
				[1, 0],
				[0, 1]
			]) {
				const target = neighborIndex(index, dx, dy);
				if (target === null) continue;

				const swapped = [...source];
				[swapped[index], swapped[target]] = [swapped[target], swapped[index]];

				if (findMatches(swapped).size > 0) {
					return true;
				}
			}
		}

		return false;
	}

	function createSolvableBoard() {
		let next = Array.from({ length: BOARD_COLS * BOARD_ROWS }, () => randomGem());
		let guard = 0;

		while ((findMatches(next).size > 0 || !hasPossibleMove(next)) && guard < 80) {
			next = Array.from({ length: BOARD_COLS * BOARD_ROWS }, () => randomGem());
			guard += 1;
		}

		return next;
	}

	function createBoard() {
		board = createSolvableBoard();
		matchedIndexes = new Set();
		fallingIndexes = new Set();
	}

	function collapseBoard(source: Gem[], matched: Set<number>) {
		const next = [...source];
		const falling = new Set<number>();

		for (let col = 0; col < BOARD_COLS; col += 1) {
			const survivors: Array<{ gem: Gem; fromRow: number }> = [];
			for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
				const index = indexOf(row, col);
				if (!matched.has(index)) {
					survivors.push({ gem: next[index], fromRow: row });
				}
			}

			for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
				const index = indexOf(row, col);
				const survivor = survivors.shift();

				if (survivor) {
					next[index] = survivor.gem;

					if (survivor.fromRow !== row) {
						falling.add(index);
					}

					continue;
				}

				next[index] = randomGem();
				falling.add(index);
			}
		}

		return { next, falling };
	}

	async function resolveMatches(source: Gem[]) {
		if (isResolving) {
			return;
		}

		isResolving = true;
		let next = [...source];
		let total = 0;
		let matched = findMatches(next);

		while (matched.size > 0) {
			total += matched.size;
			matchedIndexes = new Set(matched);
			await wait(180);

			const collapsed = collapseBoard(next, matched);
			next = collapsed.next;
			board = next;
			matchedIndexes = new Set();
			fallingIndexes = collapsed.falling;
			await wait(220);
			fallingIndexes = new Set();

			matched = findMatches(next);
		}

		if (total > 0) {
			currency += total * GEM_SCORE;
		}

		if (!hasPossibleMove(next)) {
			board = createSolvableBoard();
			fallingIndexes = new Set();
		}

		isResolving = false;
	}

	function handleGemPointerDown(index: number, event: PointerEvent) {
		if (isResolving || isSwapping) {
			return;
		}

		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		swipeStart = {
			index,
			x: event.clientX,
			y: event.clientY
		};
	}

	async function handleGemPointerUp(index: number, event: PointerEvent) {
		if (!swipeStart || swipeStart.index !== index || isResolving || isSwapping) {
			swipeStart = null;
			return;
		}

		const targetElement = event.currentTarget as HTMLElement;
		if (targetElement.hasPointerCapture(event.pointerId)) {
			targetElement.releasePointerCapture(event.pointerId);
		}

		if (status !== "playing") {
			startGame();
		}

		const dx = event.clientX - swipeStart.x;
		const dy = event.clientY - swipeStart.y;
		swipeStart = null;

		if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
			return;
		}

		const horizontal = Math.abs(dx) > Math.abs(dy);
		const moveX = horizontal ? (dx > 0 ? 1 : -1) : 0;
		const moveY = horizontal ? 0 : dy > 0 ? 1 : -1;
		const target = neighborIndex(index, moveX, moveY);

		if (target === null) {
			return;
		}

		const swapped = [...board];
		[swapped[index], swapped[target]] = [swapped[target], swapped[index]];

		if (findMatches(swapped).size > 0) {
			isSwapping = true;
			swapMotion = { from: index, to: target, dx: moveX, dy: moveY };
			await wait(170);
			board = swapped;
			swapMotion = null;
			isSwapping = false;
			void resolveMatches(swapped);
			return;
		}

		isSwapping = true;
		swapMotion = { from: index, to: target, dx: moveX, dy: moveY };
		await wait(120);
		swapMotion = null;
		isSwapping = false;
	}

	function gemSwapStyle(index: number) {
		if (!swapMotion) {
			return "";
		}

		if (index === swapMotion.from) {
			return `--swap-x:${swapMotion.dx}; --swap-y:${swapMotion.dy};`;
		}

		if (index === swapMotion.to) {
			return `--swap-x:${swapMotion.dx * -1}; --swap-y:${swapMotion.dy * -1};`;
		}

		return "";
	}

	function isSwapMoving(index: number) {
		return swapMotion?.from === index || swapMotion?.to === index;
	}

	function laneOffset(team: "ally" | "enemy") {
		const sameTeam = units.filter((unit) => unit.team === team);
		const base = LANE_OFFSETS[sameTeam.length % LANE_OFFSETS.length];
		return team === "ally" ? base - 18 : base + 18;
	}

	function createUnit(def: ByulnanbayaUnitDefinition, team: "ally" | "enemy", y: number) {
		return {
			id: unitId++,
			team,
			kind: def.id,
			name: def.name,
			hp: def.hp,
			maxHp: def.hp,
			attack: def.attack,
			speed: def.speed,
			y,
			xOffset: laneOffset(team),
			color: def.color,
			cooldown: 0
		} satisfies ByulnanbayaFieldUnit;
	}

	function summonUnit(def: ByulnanbayaUnitDefinition) {
		if (status !== "playing") {
			startGame();
		}

		if (currency < def.cost || status !== "playing") {
			return;
		}

		currency -= def.cost;
		units = [...units, createUnit(def, "ally", ALLY_SPAWN_Y)];
		void tick().then(followActiveUnit);
	}

	function spawnEnemyWave() {
		const enemyCount = units.filter((unit) => unit.team === "enemy").length;
		if (enemyCount >= MAX_ENEMIES) {
			return;
		}

		const count = Math.min(MAX_ENEMIES - enemyCount, Math.random() > 0.72 ? 2 : 1);
		const spawned = Array.from({ length: count }, (_, index) => {
			const def = enemyDefs[Math.floor(Math.random() * enemyDefs.length)];
			return createUnit(def, "enemy", ENEMY_SPAWN_Y + index * 46);
		});

		units = [...units, ...spawned];
	}

	function nearestOpponent(unit: ByulnanbayaFieldUnit) {
		let nearest: ByulnanbayaFieldUnit | null = null;
		let distance = Number.POSITIVE_INFINITY;

		for (const other of units) {
			if (other.team === unit.team || other.hp <= 0) continue;
			const yDistance = Math.abs(other.y - unit.y);
			const xDistance = Math.abs(other.xOffset - unit.xOffset);
			const nextDistance = yDistance + xDistance * 0.35;
			if (nextDistance < distance) {
				distance = nextDistance;
				nearest = other;
			}
		}

		return nearest && Math.abs(nearest.y - unit.y) < 58 ? nearest : null;
	}

	function gameStep(delta: number) {
		if (status !== "playing") {
			return;
		}

		enemySpawnElapsed += delta;
		if (enemySpawnElapsed > ENEMY_SPAWN_SECONDS) {
			enemySpawnElapsed = 0;
			spawnEnemyWave();
		}

		const nextUnits = units.map((unit) => ({ ...unit, cooldown: Math.max(0, unit.cooldown - delta) }));
		const damage = new Map<number, number>();

		for (const unit of nextUnits) {
			const target = nearestOpponent(unit);
			if (target && unit.cooldown <= 0) {
				damage.set(target.id, (damage.get(target.id) ?? 0) + unit.attack);
				unit.cooldown = 0.58;
				continue;
			}

			if (!target) {
				unit.y += unit.team === "ally" ? -unit.speed * delta : unit.speed * delta;
			}

			if (unit.team === "ally" && unit.y <= CASTLE_Y + 72 && unit.cooldown <= 0) {
				castleHp = Math.max(0, castleHp - unit.attack);
				unit.cooldown = 0.44;
			}
		}

		units = nextUnits
			.map((unit) => ({
				...unit,
				hp: unit.hp - (damage.get(unit.id) ?? 0)
			}))
			.filter((unit) => unit.hp > 0 && unit.y > 120 && unit.y < FIELD_HEIGHT + 60);

		if (castleHp <= 0) {
			clearTimeMs = Math.max(0, Math.round(performance.now() - gameStartTime));
			status = "victory";
			stopLoop();
			void submitClearRecord();
		} else if (units.some((unit) => unit.team === "enemy" && unit.y > ALLY_SPAWN_Y + 20)) {
			status = "defeat";
			stopLoop();
		}

		if (followUnits) {
			followActiveUnit();
		}
	}

	function loop(now: number) {
		const delta = Math.min((now - lastFrame) / 1000, 0.05);
		lastFrame = now;
		gameStep(delta);
		loopHandle = requestAnimationFrame(loop);
	}

	function stopLoop() {
		if (loopHandle !== null) {
			cancelAnimationFrame(loopHandle);
			loopHandle = null;
		}
	}

	function startGame() {
		stopLoop();
		status = "playing";
		currency = 100;
		castleHp = CASTLE_MAX_HP;
		units = [];
		clearTimeMs = null;
		recordSubmitted = false;
		submittingRecord = false;
		matchedIndexes = new Set();
		fallingIndexes = new Set();
		isResolving = false;
		isSwapping = false;
		swapMotion = null;
		enemySpawnElapsed = 2.5;
		createBoard();
		gameStartTime = performance.now();
		lastFrame = gameStartTime;
		loopHandle = requestAnimationFrame(loop);
		void tick().then(() => scrollToBottom());
	}

	function scrollToBottom() {
		if (!fieldScroller) return;
		fieldScroller.scrollTop = fieldScroller.scrollHeight;
	}

	function followActiveUnit() {
		if (!fieldScroller || status !== "playing") {
			return;
		}

		const allies = units.filter((unit) => unit.team === "ally");
		const focusY = allies.length ? Math.min(...allies.map((unit) => unit.y)) : ALLY_SPAWN_Y;
		const nextTop = Math.max(0, focusY - fieldScroller.clientHeight * 0.58);
		fieldScroller.scrollTo({ top: nextTop, behavior: "smooth" });
	}

	function handleFieldScroll() {
		followUnits = false;

		if (followResumeHandle) {
			clearTimeout(followResumeHandle);
		}

		followResumeHandle = setTimeout(() => {
			followUnits = true;
		}, 2400);
	}

	function toggleExpanded() {
		isExpanded = !isExpanded;
		void tick().then(() => {
			if (followUnits) {
				followActiveUnit();
			}
		});
	}

	onMount(() => {
		createBoard();
		void loadRankings();
		void tick().then(scrollToBottom);

		return () => {
			stopLoop();
			if (followResumeHandle) {
				clearTimeout(followResumeHandle);
			}
		};
	});
</script>

<svelte:head>
	<title>별난바야</title>
</svelte:head>

<section class:expanded={isExpanded} class="byul-page">
	<div class="phone-frame">
		<div class="game-screen">
			<header class="hud">
				<button type="button" class="expand-button" onclick={toggleExpanded} aria-label={isExpanded ? "게임 화면 축소" : "게임 화면 확대"}>
					<span class:contract={isExpanded} class="expand-icon"></span>
				</button>
				<div class="hud-actions">
					<button type="button" class="ranking-button" onclick={openRankingModal}>랭킹보기</button>
					<div class="currency-pill">
						<span>재화</span>
						<strong>{currency}</strong>
					</div>
				</div>
			</header>

			<section class="battle-wrap">
				<aside class="unit-shop" aria-label="유닛 뽑기">
					{#each unitDefs as unit}
						<button
							type="button"
							class="unit-card"
							class:disabled={currency < unit.cost}
							onclick={() => summonUnit(unit)}
							aria-label={`${unit.name} 소환`}
						>
							<span class="unit-cost">{unit.cost}</span>
							<span class="portrait" style={`--unit-color:${unit.color};`}>
								<span>{unit.name.slice(0, 1)}</span>
							</span>
							<small>{unit.name}</small>
						</button>
					{/each}
				</aside>

				<div class="field-viewport" bind:this={fieldScroller} onscroll={handleFieldScroll}>
					<div class="field" style={`height:${FIELD_HEIGHT}px;`}>
						<div class="castle" style={`top:${CASTLE_Y}px;`}>
							<div class="castle-hp"><span style={`width:${castleHpPercent}%;`}></span></div>
						</div>

						<div class="lane"></div>

						{#each units as unit (unit.id)}
							<div
								class={`field-unit ${unit.team}`}
								style={`--unit-color:${unit.color}; --unit-x:${unit.xOffset}px; top:${unit.y}px;`}
							>
								<span class="unit-body">{unit.name.slice(0, 1)}</span>
								<span class="hp-bar"><span style={`width:${Math.max(0, (unit.hp / unit.maxHp) * 100)}%;`}></span></span>
							</div>
						{/each}
					</div>
				</div>

				{#if status === "ready" || status === "victory" || status === "defeat"}
					<div class="result-layer">
						<div class="result-card">
							<h2>{status === "victory" ? "승리" : status === "defeat" ? "패배" : "별난바야"}</h2>
							<p>
								{status === "victory"
										? "적의 성을 격파했습니다."
										: status === "defeat"
											? "적이 소환 지점까지 내려왔습니다."
											: "보석을 밀어 재화를 모으고 유닛을 올려 보내세요."}
							</p>
							{#if status === "victory" && clearTimeMs !== null}
								<strong class="clear-time">{formatClearTime(clearTimeMs)}</strong>
								<small class:error={Boolean(rankingError)}>
									{submittingRecord
										? "기록 등록 중"
										: recordSubmitted
											? "기록 등록 완료"
											: rankingError || "기록 대기 중"}
								</small>
							{/if}
							<button type="button" onclick={startGame}>{status === "ready" ? "시작" : "다시 시작"}</button>
						</div>
					</div>
				{/if}
			</section>

			<section class="match-board" aria-label="3매치 게임판">
				<div class="gem-grid">
					{#each board as gem, index (gem.id)}
						<button
							type="button"
							class={`gem ${gem.kind}`}
							class:matched={matchedIndexes.has(index)}
							class:falling={fallingIndexes.has(index)}
							class:swapping={isSwapMoving(index)}
							style={gemSwapStyle(index)}
							aria-label={gemLabel[gem.kind]}
							onpointerdown={(event) => handleGemPointerDown(index, event)}
							onpointerup={(event) => handleGemPointerUp(index, event)}
							onpointercancel={() => (swipeStart = null)}
						>
							<span></span>
						</button>
					{/each}
				</div>
			</section>

			{#if rankingModalOpen}
				<div class="modal-backdrop">
					<div class="ranking-modal" role="dialog" aria-modal="true" aria-label="별난바야 랭킹" tabindex="-1">
						<header>
							<h2>랭킹</h2>
							<button type="button" onclick={() => (rankingModalOpen = false)} aria-label="랭킹 닫기">×</button>
						</header>

						{#if rankingLoading}
							<p class="ranking-message">불러오는 중</p>
						{:else if rankingError}
							<p class="ranking-message error">{rankingError}</p>
						{:else if rankings.length === 0}
							<p class="ranking-message">아직 기록이 없습니다.</p>
						{:else}
							<ol class="ranking-list">
								{#each rankings.slice(0, RANKING_LIMIT) as ranking}
									<li>
										<span class="rank">{ranking.rank}</span>
										<span class="runner">{ranking.userName || "익명"}</span>
										<strong>{rankingTime(ranking)}</strong>
									</li>
								{/each}
							</ol>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.byul-page {
		width: min(100%, 520px);
		margin-inline: auto;
		display: grid;
		justify-items: center;
		color: #182033;
	}

	.phone-frame {
		width: min(100%, 480px);
		height: min(820px, calc(100dvh - 96px));
		min-height: 640px;
		border-radius: 22px;
		padding: 10px;
		background: color-mix(in srgb, var(--surface) 96%, transparent);
		box-shadow: var(--shadow-card);
	}

	.game-screen {
		position: relative;
		width: 100%;
		height: 100%;
		display: grid;
		grid-template-rows: 50px minmax(0, 1fr) auto;
		overflow: hidden;
		border-radius: 16px;
		background: #d7d8d8;
	}

	.hud {
		position: relative;
		z-index: 8;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.32);
		backdrop-filter: blur(8px);
	}

	.hud-actions {
		display: inline-flex;
		align-items: center;
		gap: 7px;
	}

	.expand-button,
	.ranking-button,
	.currency-pill {
		min-height: 34px;
		border-radius: 999px;
		border: 0;
		background: rgba(255, 255, 255, 0.78);
		box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
	}

	.expand-button {
		width: 38px;
		display: grid;
		place-items: center;
		color: #24449f;
		cursor: pointer;
	}

	.ranking-button {
		padding: 0 11px;
		color: #24449f;
		font-size: 12px;
		font-weight: 900;
		cursor: pointer;
	}

	.expand-icon {
		position: relative;
		width: 16px;
		height: 16px;
		display: block;
	}

	.expand-icon::before,
	.expand-icon::after {
		content: "";
		position: absolute;
		inset: 0;
		border: 2px solid currentColor;
	}

	.expand-icon::before {
		clip-path: polygon(0 0, 44% 0, 44% 22%, 22% 22%, 22% 44%, 0 44%);
	}

	.expand-icon::after {
		clip-path: polygon(56% 56%, 78% 56%, 78% 78%, 100% 78%, 100% 100%, 56% 100%);
	}

	.expand-icon.contract::before {
		clip-path: polygon(22% 0, 44% 0, 44% 44%, 0 44%, 0 22%, 22% 22%);
	}

	.expand-icon.contract::after {
		clip-path: polygon(56% 56%, 100% 56%, 100% 78%, 78% 78%, 78% 100%, 56% 100%);
	}

	.currency-pill {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
	}

	.currency-pill span {
		color: #5b6475;
		font-size: 12px;
		font-weight: 800;
	}

	.currency-pill strong {
		font-size: 18px;
	}

	.battle-wrap {
		position: relative;
		display: block;
		min-height: 0;
	}

	.unit-shop {
		position: absolute;
		top: 10px;
		left: 8px;
		z-index: 4;
		display: grid;
		align-content: start;
		gap: 9px;
		width: 54px;
		padding: 8px 4px;
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.46);
		backdrop-filter: blur(8px);
	}

	.unit-card {
		position: relative;
		display: grid;
		gap: 4px;
		justify-items: center;
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
	}

	.unit-card.disabled {
		opacity: 0.52;
	}

	.unit-cost {
		position: absolute;
		top: -3px;
		right: 0;
		z-index: 2;
		min-width: 28px;
		padding: 2px 5px;
		border-radius: 999px;
		background: #111827;
		color: #fff;
		font-size: 10px;
		font-weight: 900;
	}

	.portrait {
		width: 42px;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border-radius: 11px;
		background:
			linear-gradient(145deg, rgba(255, 255, 255, 0.42), transparent 48%),
			var(--unit-color);
		box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.48);
	}

	.portrait span {
		color: #fff;
		font-weight: 900;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.28);
	}

	.unit-card small {
		width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 10px;
		font-weight: 800;
	}

	.field-viewport {
		width: 100%;
		height: 100%;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: none;
		touch-action: pan-y;
	}

	.field-viewport::-webkit-scrollbar {
		display: none;
	}

	.field {
		position: relative;
		min-width: 0;
		background:
			linear-gradient(90deg, rgba(255, 255, 255, 0.18) 49%, rgba(255, 255, 255, 0.38) 50%, rgba(255, 255, 255, 0.18) 51%),
			linear-gradient(180deg, #c9d6e5 0%, #d7d8d8 62%, #d1d4cf 100%);
	}

	.lane {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 150px;
		transform: translateX(-50%);
		background: rgba(255, 255, 255, 0.18);
		border-inline: 1px dashed rgba(30, 41, 59, 0.14);
	}

	.castle {
		position: absolute;
		left: 50%;
		width: min(220px, 78%);
		height: 98px;
		transform: translateX(-50%);
		display: grid;
		place-items: center;
		gap: 8px;
		padding: 14px;
		border-radius: 16px 16px 8px 8px;
		background: linear-gradient(180deg, #5b6475, #343b4b);
		color: #fff;
		box-shadow: 0 18px 26px rgba(15, 23, 42, 0.22);
	}

	.castle-hp,
	.hp-bar {
		width: 100%;
		height: 7px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.28);
		overflow: hidden;
	}

	.castle-hp span,
	.hp-bar span {
		display: block;
		height: 100%;
		background: linear-gradient(90deg, #fb7185, #facc15);
	}

	.field-unit {
		position: absolute;
		left: calc(50% + var(--unit-x));
		width: 48px;
		transform: translate(-50%, -50%);
		display: grid;
		justify-items: center;
		gap: 4px;
		transition: top 0.08s linear;
	}

	.unit-body {
		width: 42px;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border-radius: 12px;
		background: var(--unit-color);
		color: #fff;
		font-weight: 900;
		box-shadow:
			inset 0 0 0 2px rgba(255, 255, 255, 0.5),
			0 8px 16px rgba(15, 23, 42, 0.14);
	}

	.field-unit.enemy .unit-body {
		filter: saturate(0.75) brightness(0.86);
	}

	.result-layer {
		position: absolute;
		inset: 0;
		z-index: 7;
		display: grid;
		place-items: center;
		background: rgba(15, 23, 42, 0.22);
		backdrop-filter: blur(4px);
	}

	.result-card {
		width: min(280px, calc(100% - 32px));
		display: grid;
		justify-items: center;
		gap: 10px;
		padding: 22px;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.94);
		text-align: center;
		box-shadow: 0 20px 38px rgba(15, 23, 42, 0.18);
	}

	.result-card h2,
	.result-card p {
		margin: 0;
	}

	.result-card p {
		color: #556274;
		line-height: 1.55;
	}

	.clear-time {
		font-size: 22px;
		font-variant-numeric: tabular-nums;
		color: #24449f;
	}

	.result-card small {
		min-height: 16px;
		color: #64748b;
		font-size: 12px;
		font-weight: 800;
	}

	.result-card small.error {
		color: #be123c;
	}

	.result-card button {
		min-height: 40px;
		border: 0;
		border-radius: 999px;
		padding: 0 18px;
		background: #3c63d1;
		color: #fff;
		font-weight: 900;
		cursor: pointer;
	}

	.modal-backdrop {
		position: absolute;
		inset: 0;
		z-index: 12;
		display: grid;
		place-items: center;
		padding: 18px;
		background: rgba(15, 23, 42, 0.42);
		backdrop-filter: blur(5px);
	}

	.ranking-modal {
		width: min(360px, 100%);
		max-height: min(520px, calc(100% - 28px));
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: 14px;
		padding: 18px;
		border-radius: 18px;
		background: rgba(255, 255, 255, 0.96);
		box-shadow: 0 22px 48px rgba(15, 23, 42, 0.28);
	}

	.ranking-modal header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.ranking-modal h2 {
		margin: 0;
		font-size: 20px;
	}

	.ranking-modal header button {
		width: 34px;
		aspect-ratio: 1;
		border: 0;
		border-radius: 999px;
		background: #eef2ff;
		color: #24449f;
		font-size: 22px;
		font-weight: 900;
		line-height: 1;
		cursor: pointer;
	}

	.ranking-message {
		margin: 0;
		padding: 28px 0;
		text-align: center;
		color: #64748b;
		font-weight: 800;
	}

	.ranking-message.error {
		color: #be123c;
	}

	.ranking-list {
		min-height: 0;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
		overflow-y: auto;
		list-style: none;
	}

	.ranking-list li {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 10px;
		border-radius: 12px;
		background: #f8fafc;
	}

	.rank {
		width: 28px;
		aspect-ratio: 1;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: #24449f;
		color: #fff;
		font-size: 12px;
		font-weight: 900;
	}

	.runner {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: #334155;
		font-weight: 900;
	}

	.ranking-list strong {
		font-variant-numeric: tabular-nums;
		color: #111827;
		font-size: 14px;
	}

	.match-board {
		padding: 8px;
		background: #f5c467;
		border-top: 2px solid rgba(17, 24, 39, 0.88);
	}

	.gem-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		grid-template-rows: repeat(4, 1fr);
		gap: 3px;
		touch-action: none;
	}

	.gem {
		--swap-x: 0;
		--swap-y: 0;
		aspect-ratio: 1;
		border: 2px solid rgba(17, 24, 39, 0.72);
		border-radius: 6px;
		background: #fff;
		padding: 0;
		cursor: grab;
		transition:
			transform 0.16s ease,
			opacity 0.16s ease,
			filter 0.16s ease;
		will-change: transform;
		touch-action: none;
		user-select: none;
	}

	.gem:active {
		cursor: grabbing;
	}

	.gem.swapping {
		z-index: 2;
		animation: gem-swap 0.17s ease-in-out;
	}

	.gem span {
		display: block;
		width: 68%;
		aspect-ratio: 1;
		margin: auto;
		border-radius: 999px;
		box-shadow:
			inset -6px -8px 10px rgba(0, 0, 0, 0.12),
			inset 5px 5px 9px rgba(255, 255, 255, 0.38);
	}

	.gem.matched {
		animation: match-pop 0.18s ease forwards;
	}

	.gem.falling {
		animation: gem-fall 0.22s ease-out;
	}

	.gem.ruby span {
		background: #fb7185;
	}

	.gem.sun span {
		background: #facc15;
	}

	.gem.leaf span {
		background: #34d399;
	}

	.gem.wave span {
		background: #38bdf8;
	}

	.gem.violet span {
		background: #a78bfa;
	}

	@keyframes match-pop {
		0% {
			transform: scale(1);
			filter: brightness(1);
			opacity: 1;
		}

		70% {
			transform: scale(1.16);
			filter: brightness(1.35);
			opacity: 0.94;
		}

		100% {
			transform: scale(0.5);
			filter: brightness(1.5);
			opacity: 0;
		}
	}

	@keyframes gem-swap {
		from {
			transform: translate(0, 0) scale(1);
		}

		55% {
			transform: translate(calc(var(--swap-x) * 100%), calc(var(--swap-y) * 100%)) scale(1.05);
		}

		to {
			transform: translate(calc(var(--swap-x) * 100%), calc(var(--swap-y) * 100%)) scale(1.02);
		}
	}

	@keyframes gem-fall {
		from {
			transform: translateY(-34px);
			opacity: 0.2;
		}

		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.byul-page.expanded {
		position: fixed;
		inset: 0;
		z-index: 9999;
		width: 100vw;
		height: 100dvh;
		background: #0f172a;
	}

	.byul-page.expanded .phone-frame {
		width: min(100vw, 480px);
		height: 100dvh;
		min-height: 0;
		padding: 0;
		border-radius: 0;
		box-shadow: none;
		background: transparent;
	}

	.byul-page.expanded .game-screen {
		border-radius: 0;
	}

	:global(body:has(.byul-page.expanded) .topbar),
	:global(body:has(.byul-page.expanded) .sidebar) {
		display: none;
	}

	:global(body:has(.byul-page.expanded) .content) {
		padding: 0;
		margin-left: 0 !important;
		width: 100% !important;
	}

	@media (max-width: 540px) {
		.byul-page {
			width: 100%;
		}

		.phone-frame {
			width: 100%;
			height: calc(100dvh - 92px);
			min-height: 0;
			padding: 0;
			border-radius: 0;
		}

		.game-screen {
			border-radius: 0;
		}
	}

	:global(html[data-theme="dark"]) .phone-frame {
		background: rgba(23, 27, 34, 0.94);
	}
</style>
