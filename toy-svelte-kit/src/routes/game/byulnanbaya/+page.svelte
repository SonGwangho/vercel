<script lang="ts">
	import { onMount, tick } from "svelte";
	import { createRanking, loadRankings as loadRankingList } from "$lib";
	import { requireGameCode } from "$lib/gameCodes";
	import type {
		ByulnanbayaFieldUnit,
		ByulnanbayaStatus,
		ByulnanbayaUnitDefinition,
		ByulnanbayaGemKind as GemKind,
		ByulnanbayaGem as Gem,
		ByulnanbayaSwipeStart as SwipeStart,
		ByulnanbayaSwapMotion as SwapMotion,
		RankingListItem
	} from "$lib";

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
	let units = $state.raw<ByulnanbayaFieldUnit[]>([]);
	let board = $state.raw<Gem[]>([]);
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
	let userName = $state("");
	let followResumeHandle: ReturnType<typeof setTimeout> | null = null;
	let fieldScroller = $state<HTMLDivElement | null>(null);
	let fieldHeight = 0;
	let lastFollowAt = 0;
	let lastFollowTop = -1;
	let hiddenAt = 0;
	let matchRevision = 0;
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
			const data = await loadRankingList(GAME_CODE, RANKING_LIMIT);
			rankings = data.rankings;
		} catch {
			rankingError = "랭킹을 불러오지 못했습니다.";
		} finally {
			rankingLoading = false;
		}
	}

	async function submitClearRecord() {
		if (clearTimeMs === null || !userName.trim() || submittingRecord || recordSubmitted) {
			return;
		}

		submittingRecord = true;
		rankingError = "";

		try {
			await createRanking({
				gameCode: GAME_CODE,
				gameName: gameMeta.gameName,
				userName: userName.trim(),
				score: rankingScoreFromTime(clearTimeMs)
			});
			recordSubmitted = true;
			await loadRankings();
		} catch {
			rankingError = "기록 등록에 실패했습니다.";
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
		const swapped = [...source];
		for (let index = 0; index < source.length; index += 1) {
			for (const [dx, dy] of [
				[1, 0],
				[0, 1]
			]) {
				const target = neighborIndex(index, dx, dy);
				if (target === null) continue;

				[swapped[index], swapped[target]] = [swapped[target], swapped[index]];
				const hasMatch = findMatches(swapped).size > 0;
				[swapped[index], swapped[target]] = [swapped[target], swapped[index]];
				if (hasMatch) {
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
		const revision = matchRevision;
		let next = [...source];
		let total = 0;
		let matched = findMatches(next);

		while (matched.size > 0) {
			total += matched.size;
			matchedIndexes = new Set(matched);
			await wait(180);
			if (revision !== matchRevision || status !== "playing") return;

			const collapsed = collapseBoard(next, matched);
			next = collapsed.next;
			board = next;
			matchedIndexes = new Set();
			fallingIndexes = collapsed.falling;
			await wait(220);
			if (revision !== matchRevision || status !== "playing") return;
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

		const swipe = swipeStart;
		const targetElement = event.currentTarget as HTMLElement;
		if (targetElement.hasPointerCapture(event.pointerId)) {
			targetElement.releasePointerCapture(event.pointerId);
		}

		if (status !== "playing") {
			startGame();
		}

		if (status !== "playing") { swipeStart = null; return; }

		const dx = event.clientX - swipe.x;
		const dy = event.clientY - swipe.y;
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

		const revision = matchRevision;
		const swapped = [...board];
		[swapped[index], swapped[target]] = [swapped[target], swapped[index]];

		if (findMatches(swapped).size > 0) {
			isSwapping = true;
			swapMotion = { from: index, to: target, dx: moveX, dy: moveY };
			await wait(170);
			if (revision !== matchRevision || status !== "playing") return;
			board = swapped;
			swapMotion = null;
			isSwapping = false;
			void resolveMatches(swapped);
			return;
		}

		isSwapping = true;
		swapMotion = { from: index, to: target, dx: moveX, dy: moveY };
		await wait(120);
		if (revision !== matchRevision || status !== "playing") return;
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

	function nearestOpponent(unit: ByulnanbayaFieldUnit, opponents: ByulnanbayaFieldUnit[]) {
		let nearest: ByulnanbayaFieldUnit | null = null;
		let distance = Number.POSITIVE_INFINITY;

		for (const other of opponents) {
			if (other.hp <= 0) continue;
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

		const allies = units.filter((unit) => unit.team === "ally");
		const enemies = units.filter((unit) => unit.team === "enemy");
		const nextUnits = units.map((unit) => ({ ...unit, cooldown: Math.max(0, unit.cooldown - delta) }));
		const damage = new Map<number, number>();

		for (const unit of nextUnits) {
			const target = nearestOpponent(unit, unit.team === "ally" ? enemies : allies);
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

		for (const unit of nextUnits) unit.hp -= damage.get(unit.id) ?? 0;
		units = nextUnits.filter((unit) => unit.hp > 0 && unit.y > 120 && unit.y < FIELD_HEIGHT + 60);

		if (castleHp <= 0) {
			clearTimeMs = Math.max(0, Math.round(performance.now() - gameStartTime));
			status = "victory";
			stopLoop();
		} else if (units.some((unit) => unit.team === "enemy" && unit.y > ALLY_SPAWN_Y + 20)) {
			status = "defeat";
			stopLoop();
		}

	}

	function loop(now: number) {
		loopHandle = null;
		if (status !== "playing" || document.hidden) return;
		const delta = Math.min((now - lastFrame) / 1000, 0.05);
		lastFrame = now;
		gameStep(delta);
		if (status !== "playing") return;
		if (followUnits && now - lastFollowAt >= 50) {
			lastFollowAt = now;
			followActiveUnit();
		}
		loopHandle = requestAnimationFrame(loop);
	}

	function stopLoop() {
		if (loopHandle !== null) {
			cancelAnimationFrame(loopHandle);
			loopHandle = null;
		}
	}

	function startGame() {
		if (submittingRecord) return;
		stopLoop();
		matchRevision += 1;
		hiddenAt = 0;
		lastFollowAt = 0;
		lastFollowTop = -1;
		followUnits = true;
		if (followResumeHandle) clearTimeout(followResumeHandle);
		followResumeHandle = null;
		status = "playing";
		currency = 100;
		castleHp = CASTLE_MAX_HP;
		units = [];
		clearTimeMs = null;
		recordSubmitted = false;
		submittingRecord = false;
		userName = "";
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
		fieldScroller.scrollTop = FIELD_HEIGHT;
		lastFollowTop = -1;
	}

	function followActiveUnit() {
		if (!fieldScroller || status !== "playing") {
			return;
		}

		let focusY = ALLY_SPAWN_Y;
		for (const unit of units) if (unit.team === "ally") focusY = Math.min(focusY, unit.y);
		const nextTop = Math.max(0, Math.min(FIELD_HEIGHT - fieldHeight, focusY - fieldHeight * 0.58));
		if (Math.abs(nextTop - lastFollowTop) < 1) return;
		fieldScroller.scrollTop = nextTop;
		lastFollowTop = nextTop;
	}

	function pauseFollowing() {
		followUnits = false;
		lastFollowTop = -1;

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

	function handleVisibility() {
		stopLoop();
		if (status !== "playing") return;
		if (document.hidden) {
			hiddenAt = performance.now();
		} else {
			const now = performance.now();
			if (hiddenAt) gameStartTime += now - hiddenAt;
			hiddenAt = 0;
			lastFrame = now;
			loopHandle = requestAnimationFrame(loop);
		}
	}

	$effect(() => {
		if (!fieldScroller) return;
		const observer = new ResizeObserver(([entry]) => { fieldHeight = entry.contentRect.height; lastFollowTop = -1; });
		observer.observe(fieldScroller);
		return () => observer.disconnect();
	});

	onMount(() => {
		createBoard();
		void loadRankings();
		void tick().then(scrollToBottom);
		document.addEventListener("visibilitychange", handleVisibility);

		return () => {
			matchRevision += 1;
			stopLoop();
			document.removeEventListener("visibilitychange", handleVisibility);
			if (followResumeHandle) {
				clearTimeout(followResumeHandle);
			}
		};
	});
</script>

<svelte:head>
	<title>별난바야 · 장난감 웹</title>
</svelte:head>

<section class:expanded={isExpanded} class="byul-page">
  <header class="game-heading"><div><h1>별난바야</h1><p>보석을 맞춰 재화를 모으고, 유닛으로 적의 성을 공략하세요.</p></div></header>
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
							disabled={status === "playing" && currency < unit.cost}
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

				<div class="field-viewport" bind:this={fieldScroller} onwheel={pauseFollowing} onpointerdown={pauseFollowing} onkeydown={(event) => { if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) pauseFollowing(); }} tabindex="0" role="region" aria-label="전투 지역. 스크롤해서 유닛 위치 보기">
					<div class="field" style={`height:${FIELD_HEIGHT}px;`}>
						<div class="castle" style={`top:${CASTLE_Y}px;`}>
							<div class="castle-hp"><span style={`transform:scaleX(${castleHpPercent / 100});`}></span></div>
						</div>

						<div class="lane"></div>

						{#each units as unit (unit.id)}
							<div
								class={`field-unit ${unit.team}`}
								style={`--unit-color:${unit.color}; --unit-x:${unit.xOffset}px; --unit-y:${unit.y}px;`}
							>
								<span class="unit-body">{unit.name.slice(0, 1)}</span>
								<span class="hp-bar"><span style={`transform:scaleX(${Math.max(0, unit.hp / unit.maxHp)});`}></span></span>
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
								<div class="submit-row">
									<input
										type="text"
										maxlength="12"
										bind:value={userName}
										placeholder="이름 입력"
                    aria-label="기록에 남길 이름"
										disabled={recordSubmitted || submittingRecord}
										onkeydown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												void submitClearRecord();
											}
										}}
									/>
									<button
										type="button"
										onclick={submitClearRecord}
										disabled={!userName.trim() || recordSubmitted || submittingRecord}
									>
										{recordSubmitted ? "등록 완료" : submittingRecord ? "등록 중" : "기록 등록"}
									</button>
								</div>
								{#if rankingError}
									<small class="error">{rankingError}</small>
								{/if}
							{/if}
							<button type="button" onclick={startGame} disabled={submittingRecord}>{status === "ready" ? "시작" : "다시 시작"}</button>
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
					<button
						type="button"
						class="modal-dismiss"
						onclick={() => (rankingModalOpen = false)}
						aria-label="랭킹 닫기"
					></button>
					<div class="ranking-modal" role="dialog" aria-modal="true" aria-label="별난바야 랭킹" tabindex="-1">
						<header>
							<h2>랭킹</h2>
							<button type="button" onclick={() => (rankingModalOpen = false)} aria-label="랭킹 닫기">×</button>
						</header>

						{#if rankingLoading}
							<p class="ranking-message">불러오는 중</p>
						{:else if rankingError}
							<div class="ranking-error" role="alert">
								<p class="ranking-message error">{rankingError}</p>
								<button type="button" onclick={() => void loadRankings()}>다시 시도</button>
							</div>
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
  .byul-page { width: min(100%, 560px); margin-inline: auto; color: var(--text); }
  .phone-frame { width: min(100%, 480px); height: min(820px, calc(100dvh - 220px)); min-height: 680px; margin-inline: auto; padding: 8px; border-radius: var(--panel-radius); background: var(--surface); }
  .game-screen { position: relative; width: 100%; height: 100%; display: grid; grid-template-rows: 60px minmax(0,1fr) auto; overflow: hidden; border-radius: 12px; background: var(--surface-muted); }
  .hud { position: relative; z-index: 8; display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--surface); }
  .hud-actions { display: flex; align-items: center; gap: 12px; }
  .expand-button, .ranking-button { min-height: 44px; border: 1px solid var(--line-strong); border-radius: var(--control-radius); background: var(--surface); color: var(--text); cursor: pointer; }
  .expand-button { width: 44px; display: grid; place-items: center; }
  .ranking-button { padding: 0 12px; font-size: 12px; font-weight: 600; }
  .expand-button:hover, .ranking-button:hover { background: var(--surface-strong); }
  .expand-icon { position: relative; width: 16px; height: 16px; display: block; }
  .expand-icon::before, .expand-icon::after { content: ""; position: absolute; width: 6px; height: 6px; border: 2px solid currentColor; }
  .expand-icon::before { top: 0; left: 0; border-right: 0; border-bottom: 0; }
  .expand-icon::after { bottom: 0; right: 0; border-left: 0; border-top: 0; }
  .expand-icon.contract { transform: rotate(180deg); }
  .currency-pill { display: flex; align-items: baseline; gap: 6px; }
  .currency-pill span { color: var(--muted); font-size: 12px; }
  .currency-pill strong { color: var(--brand-strong); font-size: 22px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .battle-wrap { position: relative; min-height: 0; }
  .unit-shop { position: absolute; top: 12px; left: 8px; z-index: 4; display: grid; gap: 12px; width: 62px; padding: 10px 6px; border-radius: 10px; background: var(--surface); }
  .unit-card { position: relative; display: grid; gap: 4px; justify-items: center; border: 0; background: transparent; padding: 0; color: var(--text); cursor: pointer; }
  .unit-card:disabled { cursor: not-allowed; }
  .unit-card:disabled .portrait { filter: grayscale(0.9); }
  .unit-cost { position: absolute; top: -4px; right: -2px; z-index: 2; min-width: 28px; padding: 1px 4px; border-radius: 4px; background: var(--text-strong); color: var(--surface); font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .portrait { width: 42px; aspect-ratio: 1; display: grid; place-items: center; border-radius: 10px; background: var(--unit-color); }
  .portrait span { color: #182235; font-weight: 700; font-size: 17px; }
  .unit-card small { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .field-viewport { width: 100%; height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; touch-action: pan-y; }
  .field { position: relative; min-width: 0; background: var(--surface-muted); contain: layout paint; }
  .lane { position: absolute; inset-block: 0; left: 50%; width: 150px; transform: translateX(-50%); background: var(--surface-strong); }
  .castle { position: absolute; left: 50%; width: min(220px,78%); height: 98px; transform: translateX(-50%); display: grid; place-items: center; padding: 20px; border-radius: 10px 10px 4px 4px; background: var(--text-strong); }
  .castle::before { content: "적의 성"; color: var(--surface); font-size: 15px; font-weight: 600; }
  .castle-hp, .hp-bar { width: 100%; height: 5px; border-radius: 3px; background: var(--surface-strong); overflow: hidden; }
  .castle-hp span, .hp-bar span { display: block; width: 100%; height: 100%; background: var(--danger); transform-origin: left; }
  .field-unit { position: absolute; top: 0; left: 50%; width: 48px; transform: translate(calc(-50% + var(--unit-x)),calc(var(--unit-y) - 50%)); display: grid; justify-items: center; gap: 4px; }
  .unit-body { width: 42px; aspect-ratio: 1; display: grid; place-items: center; border-radius: 10px; background: var(--unit-color); color: #182235; font-weight: 700; }
  .field-unit.ally .hp-bar span { background: var(--success); }
  .field-unit.enemy .unit-body { border: 3px solid #a62c38; border-radius: 50%; }
  .result-layer, .modal-backdrop { position: absolute; inset: 0; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--bg) 84%, transparent); }
  .result-layer { z-index: 7; }
  .result-card { width: min(340px,100%); max-height: 100%; overflow-y: auto; display: grid; gap: 12px; padding: 24px; border-radius: 12px; background: var(--surface); text-align: center; }
  .result-card h2, .result-card p { margin: 0; }
  .result-card h2 { font-size: 20px; }
  .result-card p { color: var(--muted); font-size: 13px; line-height: 1.7; }
  .clear-time { color: var(--brand-strong); font-size: 28px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .result-card small { color: var(--muted); font-size: 12px; }
  .result-card small.error { color: var(--danger); }
  .submit-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; }
  .submit-row input { min-width: 0; width: 100%; min-height: 44px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--control-radius); background: var(--surface-muted); color: var(--text); font-size: 13px; }
  .result-card button { min-height: 44px; padding: 8px 16px; border: 0; border-radius: var(--control-radius); background: var(--brand); color: var(--on-brand); font-size: 13px; font-weight: 600; cursor: pointer; }
  .result-card button:hover { background: color-mix(in srgb,var(--brand) 88%,var(--text-strong)); }
  .result-card button:disabled { background: var(--surface-strong); color: var(--muted); cursor: not-allowed; }
  .modal-backdrop { z-index: 12; }
  .modal-dismiss { position: absolute; inset: 0; border: 0; background: transparent; }
  .ranking-modal { position: relative; z-index: 1; display: grid; grid-template-rows: auto minmax(0,1fr); gap: 16px; width: min(360px,100%); max-height: min(520px,100%); padding: 24px; border-radius: var(--panel-radius); background: var(--surface); box-shadow: var(--shadow-float); }
  .ranking-modal header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .ranking-modal h2 { margin: 0; font-size: 18px; }
  .ranking-modal header button { width: 44px; height: 44px; border: 0; border-radius: var(--control-radius); background: var(--surface-muted); color: var(--text); font-size: 22px; }
  .ranking-message { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
  .ranking-message.error { color: var(--danger); }
  .ranking-error { display: grid; justify-items: start; gap: 12px; }
  .ranking-error button { min-height: 44px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--control-radius); background: var(--surface); color: var(--text); font-size: 13px; }
  .ranking-list { min-height: 0; margin: 0; padding: 0; overflow-y: auto; list-style: none; }
  .ranking-list li { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 10px; min-height: 44px; font-size: 13px; }
  .rank { color: var(--muted); font-variant-numeric: tabular-nums; }
  .runner { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ranking-list strong { color: var(--text-strong); font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
  .ranking-list li:first-child .rank, .ranking-list li:first-child strong { color: var(--brand-strong); }
  .match-board { padding: 10px; background: var(--surface); }
  .gem-grid { display: grid; grid-template-columns: repeat(7,minmax(0,1fr)); gap: 4px; touch-action: none; }
  .gem { --swap-x: 0; --swap-y: 0; aspect-ratio: 1; min-width: 0; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-muted); touch-action: none; user-select: none; cursor: grab; }
  .gem:active { cursor: grabbing; background: var(--surface-strong); }
  .gem span { display: block; width: 62%; aspect-ratio: 1; margin: auto; border-radius: 50%; }
  .gem.ruby span { background: #fb7185; border-radius: 4px; transform: rotate(45deg) scale(0.8); }
  .gem.sun span { background: #facc15; }
  .gem.leaf span { background: #34d399; border-radius: 3px 50%; }
  .gem.wave span { background: #38bdf8; border-radius: 3px 50% 50%; transform: rotate(45deg); }
  .gem.violet span { background: #a78bfa; border-radius: 4px; }
  .gem.swapping { z-index: 2; animation: gem-swap 0.17s ease-in-out; }
  .gem.matched { animation: match-pop 0.18s ease forwards; }
  .gem.falling { animation: gem-fall 0.22s ease-out; }
  @keyframes gem-swap { from { transform: translate(0,0); } to { transform: translate(calc(var(--swap-x) * 100%),calc(var(--swap-y) * 100%)); } }
  @keyframes match-pop { to { transform: scale(0.5); opacity: 0; } }
  @keyframes gem-fall { from { transform: translateY(-28px); opacity: 0.2; } to { transform: translateY(0); opacity: 1; } }
  .byul-page.expanded { position: fixed; inset: 0; z-index: 9999; width: 100vw; height: 100dvh; background: var(--bg); }
  .expanded .game-heading { display: none; }
  .expanded .phone-frame { width: min(100vw,480px); height: 100dvh; min-height: 0; padding: 0; border-radius: 0; }
  .expanded .game-screen { border-radius: 0; }
  :global(body:has(.byul-page.expanded)) { overflow: hidden; }
  @media (max-width: 540px) { .phone-frame { width: 100%; min-height: 600px; height: min(800px,calc(100dvh - 180px)); padding: 0; } .result-card { padding: 18px; } }
</style>
