<script lang="ts">
	import { onMount } from 'svelte';
	import appleConfigJson from '$lib/assets/data/apple/config.json';
	import appleImageUrl from '$lib/assets/data/apple/img/apple.png';
	import type {
		AppleGameCell,
		AppleGameConfig,
		AppleRankingItem,
		AppleScoreRequest
	} from '$lib';

	const GAME_CODE = 300;
	const GAME_DURATION_SECONDS = 120;
	const BOARD_WIDTH = 1142;
	const BOARD_HEIGHT = 700;
	const BOARD_PADDING = 50;
	const RANKING_LIMIT = 10;

	type EndReason = 'clear' | 'timeout' | null;
	type Box = { left: number; top: number; width: number; height: number };
	type BoardCell = AppleGameCell & {
		row: number;
		col: number;
		removed: boolean;
	};
	type RankingLike = Record<string, unknown>;

	const config = appleConfigJson as AppleGameConfig;
	const rows = config.rows;
	const cols = config.cols;
	const targetSum = config.targetSum ?? 10;
	const cellGap = 8;

	let board: BoardCell[][] = [];
	let selectedKeys = new Set<string>();
	let score = 0;
	let removedAppleCount = 0;
	let remainingAppleCount = rows * cols;
	let hasStarted = false;
	let isSelecting = false;
	let gameOver = false;
	let endReason: EndReason = null;
	let selectionBox: Box | null = null;
	let boardElement: HTMLDivElement | null = null;
	let boardRect: DOMRect | null = null;
	let startPoint: { x: number; y: number } | null = null;
	let currentPoint: { x: number; y: number } | null = null;
	let timeLeft = GAME_DURATION_SECONDS;
	let timerHandle: ReturnType<typeof setInterval> | null = null;
	let rankings: AppleRankingItem[] = [];
	let rankingLoading = false;
	let rankingError = '';
	let submittingScore = false;
	let scoreSubmitted = false;
	let userName = '';

	const playableWidth = BOARD_WIDTH - BOARD_PADDING * 2;
	const playableHeight = BOARD_HEIGHT - BOARD_PADDING * 2;
	const cellSize = Math.min(
		(playableWidth - cellGap * (cols - 1)) / cols,
		(playableHeight - cellGap * (rows - 1)) / rows
	);
	const offsetX = (BOARD_WIDTH - (cellSize * cols + cellGap * (cols - 1))) / 2;
	const offsetY = (BOARD_HEIGHT - (cellSize * rows + cellGap * (rows - 1))) / 2;

	function cellLeftPercent(col: number): number {
		return ((offsetX + col * (cellSize + cellGap)) / BOARD_WIDTH) * 100;
	}

	function cellTopPercent(row: number): number {
		return ((offsetY + row * (cellSize + cellGap)) / BOARD_HEIGHT) * 100;
	}

	function cellWidthPercent(): number {
		return (cellSize / BOARD_WIDTH) * 100;
	}

	function cellHeightPercent(): number {
		return (cellSize / BOARD_HEIGHT) * 100;
	}

	function createBoard(): BoardCell[][] {
		return Array.from({ length: rows }, (_, row) =>
			Array.from({ length: cols }, (_, col) => ({
				id: row * cols + col + 1,
				row,
				col,
				value: ((row + col) % 9) + 1,
				removed: false
			}))
		);
	}

	function keyOf(row: number, col: number): string {
		return `${row}:${col}`;
	}

	function resetGame(): void {
		board = createBoard();
		selectedKeys = new Set();
		score = 0;
		removedAppleCount = 0;
		remainingAppleCount = rows * cols;
		timeLeft = GAME_DURATION_SECONDS;
		gameOver = false;
		endReason = null;
		isSelecting = false;
		selectionBox = null;
		startPoint = null;
		currentPoint = null;
		scoreSubmitted = false;
		userName = '';
		stopTimer();
	}

	function startGame(): void {
		resetGame();
		hasStarted = true;
		startTimer();
	}

	function startTimer(): void {
		stopTimer();
		timerHandle = setInterval(() => {
			if (gameOver) {
				stopTimer();
				return;
			}

			timeLeft -= 1;

			if (timeLeft <= 0) {
				timeLeft = 0;
				gameOver = true;
				endReason = 'timeout';
				stopTimer();
			}
		}, 1000);
	}

	function stopTimer(): void {
		if (timerHandle) {
			clearInterval(timerHandle);
			timerHandle = null;
		}
	}

	function refreshBoardRect(): void {
		boardRect = boardElement?.getBoundingClientRect() ?? null;
	}

	function updateSelectionBox(): void {
		if (!startPoint || !currentPoint) {
			selectionBox = null;
			return;
		}

		const left = Math.min(startPoint.x, currentPoint.x);
		const top = Math.min(startPoint.y, currentPoint.y);
		const width = Math.abs(currentPoint.x - startPoint.x);
		const height = Math.abs(currentPoint.y - startPoint.y);

		selectionBox = { left, top, width, height };
		updateSelectionFromBox();
	}

	function updateSelectionFromBox(): void {
		if (!selectionBox) {
			selectedKeys = new Set();
			return;
		}

		const next = new Set<string>();
		const boxRight = selectionBox.left + selectionBox.width;
		const boxBottom = selectionBox.top + selectionBox.height;

		for (const row of board) {
			for (const cell of row) {
				if (cell.removed) continue;

				const cellLeft = offsetX + cell.col * (cellSize + cellGap);
				const cellTop = offsetY + cell.row * (cellSize + cellGap);
				const cellRight = cellLeft + cellSize;
				const cellBottom = cellTop + cellSize;

				const intersects =
					cellLeft < boxRight &&
					cellRight > selectionBox.left &&
					cellTop < boxBottom &&
					cellBottom > selectionBox.top;

				if (intersects) {
					next.add(keyOf(cell.row, cell.col));
				}
			}
		}

		selectedKeys = next;
	}

	function selectedCells(): BoardCell[] {
		const cells: BoardCell[] = [];

		for (const row of board) {
			for (const cell of row) {
				if (!cell.removed && selectedKeys.has(keyOf(cell.row, cell.col))) {
					cells.push(cell);
				}
			}
		}

		return cells;
	}

	function finishSelection(): void {
		if (!isSelecting || gameOver) {
			return;
		}

		isSelecting = false;

		const cells = selectedCells();
		const total = cells.reduce((sum, cell) => sum + cell.value, 0);

		if (cells.length > 0 && total === targetSum) {
			for (const cell of cells) {
				board[cell.row][cell.col].removed = true;
			}

			const removedCount = cells.length;
			removedAppleCount += removedCount;
			remainingAppleCount -= removedCount;
			score += removedCount * 10;

			if (remainingAppleCount === 0) {
				score += timeLeft * 10;
				gameOver = true;
				endReason = 'clear';
				stopTimer();
			}
		}

		selectedKeys = new Set();
		selectionBox = null;
		startPoint = null;
		currentPoint = null;
		board = board;
	}

	function handlePointerDown(event: PointerEvent): void {
		if (!hasStarted || gameOver || !boardElement) {
			return;
		}

		event.preventDefault();
		refreshBoardRect();
		if (!boardRect) return;

		const x = Math.min(Math.max(event.clientX - boardRect.left, 0), boardRect.width);
		const y = Math.min(Math.max(event.clientY - boardRect.top, 0), boardRect.height);

		startPoint = { x, y };
		currentPoint = { x, y };
		isSelecting = true;
		updateSelectionBox();
		boardElement.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent): void {
		if (!isSelecting || !boardRect) {
			return;
		}

		event.preventDefault();

		const x = Math.min(Math.max(event.clientX - boardRect.left, 0), boardRect.width);
		const y = Math.min(Math.max(event.clientY - boardRect.top, 0), boardRect.height);

		currentPoint = { x, y };
		updateSelectionBox();
	}

	function handlePointerUp(event: PointerEvent): void {
		if (!isSelecting || !boardElement) {
			return;
		}

		event.preventDefault();
		boardElement.releasePointerCapture(event.pointerId);
		finishSelection();
	}

	function formatTime(seconds: number): string {
		const minutes = Math.floor(seconds / 60);
		const remain = seconds % 60;
		return `${minutes}:${String(remain).padStart(2, '0')}`;
	}

	function isRankingEntry(value: unknown): value is RankingLike {
		if (!value || typeof value !== 'object') {
			return false;
		}

		const candidate = value as RankingLike;
		return (
			typeof candidate.score === 'number' ||
			typeof candidate.score === 'string' ||
			typeof candidate.userName === 'string' ||
			typeof candidate.username === 'string' ||
			typeof candidate.name === 'string' ||
			typeof candidate.nickName === 'string' ||
			typeof candidate.nickname === 'string'
		);
	}

	function extractRankingItems(value: unknown): RankingLike[] {
		if (Array.isArray(value)) {
			if (value.every((item) => isRankingEntry(item))) {
				return value;
			}

			for (const item of value) {
				const nested = extractRankingItems(item);
				if (nested.length > 0) {
					return nested;
				}
			}

			return [];
		}

		if (!value || typeof value !== 'object') {
			return [];
		}

		for (const nested of Object.values(value as Record<string, unknown>)) {
			const found = extractRankingItems(nested);
			if (found.length > 0) {
				return found;
			}
		}

		return [];
	}

	function normalizeRankingItem(item: RankingLike): AppleRankingItem {
		const rawName =
			item.userName ??
			item.username ??
			item.name ??
			item.nickName ??
			item.nickname ??
			item.memberName;

		const rawScore = item.score ?? item.gameScore ?? item.value ?? 0;
		const scoreValue =
			typeof rawScore === 'number'
				? rawScore
				: Number.parseInt(String(rawScore), 10) || 0;

		return {
			...item,
			userName: typeof rawName === 'string' && rawName.trim() ? rawName : '익명',
			score: scoreValue
		} as AppleRankingItem;
	}

	async function loadRankings(): Promise<void> {
		rankingLoading = true;
		rankingError = '';

		try {
			const response = await fetch(`/api/getRanking?gameCode=${GAME_CODE}`);
			if (!response.ok) {
				throw new Error('랭킹을 불러오지 못했습니다.');
			}

			const data = await response.json();
			const items = extractRankingItems(data).map(normalizeRankingItem);
			rankings = items
				.sort((a, b) => Number(b.score) - Number(a.score))
				.slice(0, RANKING_LIMIT);
		} catch (error) {
			rankingError = error instanceof Error ? error.message : '랭킹을 불러오지 못했습니다.';
		} finally {
			rankingLoading = false;
		}
	}

	async function submitScore(): Promise<void> {
		if (!userName.trim() || submittingScore || scoreSubmitted || !gameOver) {
			return;
		}

		submittingScore = true;
		rankingError = '';

		try {
			const payload: AppleScoreRequest = {
				gameCode: GAME_CODE,
				gameName: '사과게임',
				userName: userName.trim(),
				score
			};

			const response = await fetch('/api/postScore', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				throw new Error('점수 등록에 실패했습니다.');
			}

			scoreSubmitted = true;
			await loadRankings();
		} catch (error) {
			rankingError = error instanceof Error ? error.message : '점수 등록에 실패했습니다.';
		} finally {
			submittingScore = false;
		}
	}

	onMount(() => {
		resetGame();
		loadRankings();

		const handleResize = (): void => refreshBoardRect();
		window.addEventListener('resize', handleResize);

		return () => {
			stopTimer();
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<svelte:head>
	<title>사과게임</title>
</svelte:head>

<div class="apple-page">
	<header class="page-header">
		<h1>사과게임</h1>
	</header>

	<div class="game-layout">
		{#if !hasStarted}
			<section class="arena-card start-card">
				<div class="start-scene">
					<button
						type="button"
						class="start-apple"
						style={`background-image: url(${appleImageUrl});`}
						on:click={startGame}
						aria-label="게임 시작"
					>
						<span>시작</span>
					</button>
				</div>
			</section>
		{:else}
			<section class="arena-card">
				<div class="status-bar">
					<div class="status-card">
						<span class="label">남은 시간</span>
						<strong>{formatTime(timeLeft)}</strong>
					</div>
					<div class="status-card">
						<span class="label">점수</span>
						<strong>{score}</strong>
					</div>
					<div class="status-card">
						<span class="label">남은 사과</span>
						<strong>{remainingAppleCount}</strong>
					</div>
					<div class="status-card">
						<span class="label">제거한 사과</span>
						<strong>{removedAppleCount}</strong>
					</div>
				</div>

				<div
					class="board"
					bind:this={boardElement}
					on:pointerdown={handlePointerDown}
					on:pointermove={handlePointerMove}
					on:pointerup={handlePointerUp}
					on:pointercancel={handlePointerUp}
					role="presentation"
				>
					<div class="board-surface">
						{#each board as row}
							{#each row as cell}
								<div
									class:selected={selectedKeys.has(keyOf(cell.row, cell.col))}
									class:removed={cell.removed}
									class="apple-cell"
									style={`left:${cellLeftPercent(cell.col)}%; top:${cellTopPercent(cell.row)}%; width:${cellWidthPercent()}%; height:${cellHeightPercent()}%;`}
								>
									{#if !cell.removed}
										<div class="apple-face" style={`background-image: url(${appleImageUrl});`}>
											<span>{cell.value}</span>
										</div>
									{/if}
								</div>
							{/each}
						{/each}

						{#if selectionBox}
							<div
								class="selection-box"
								style={`left:${selectionBox.left}px; top:${selectionBox.top}px; width:${selectionBox.width}px; height:${selectionBox.height}px;`}
							></div>
						{/if}
					</div>

					{#if gameOver}
						<div class="overlay">
							<div class="overlay-card">
								<h2>{endReason === 'clear' ? '클리어' : '시간 종료'}</h2>
								<p>
									{#if endReason === 'clear'}
										모든 사과를 제거했습니다. 남은 시간 보너스가 반영되었습니다.
									{:else}
										2분이 지나 게임이 종료되었습니다.
									{/if}
								</p>
								<div class="overlay-score">최종 점수 {score}</div>
								<div class="submit-row">
									<input
										type="text"
										maxlength="12"
										bind:value={userName}
										placeholder="이름 입력"
										disabled={scoreSubmitted || submittingScore}
									/>
									<button
										type="button"
										on:click={submitScore}
										disabled={!userName.trim() || scoreSubmitted || submittingScore}
									>
										{scoreSubmitted ? '등록 완료' : submittingScore ? '등록 중' : '점수 등록'}
									</button>
								</div>
								<button type="button" class="restart-button" on:click={startGame}>다시 시작</button>
							</div>
						</div>
					{/if}
				</div>
			</section>
		{/if}

		<aside class="ranking-card">
			<div class="ranking-header">
				<h2>랭킹</h2>
				<span>TOP 10</span>
			</div>

			{#if rankingLoading}
				<p class="ranking-message">불러오는 중...</p>
			{:else if rankingError}
				<p class="ranking-message error">{rankingError}</p>
			{:else if rankings.length === 0}
				<p class="ranking-message">등록된 점수가 없습니다.</p>
			{:else}
				<ol class="ranking-list">
					{#each rankings as ranking, index}
						<li>
							<span class="rank">{index + 1}</span>
							<span class="name">{ranking.userName ?? '익명'}</span>
							<strong>{ranking.score}</strong>
						</li>
					{/each}
				</ol>
			{/if}
		</aside>
	</div>
</div>

<style>
	:global(body) {
		overflow-x: hidden;
	}

	.apple-page {
		display: flex;
		flex-direction: column;
		gap: 20px;
		padding: 20px 24px 32px;
		color: var(--text, #1f2937);
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.page-header h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 800;
	}

	.game-layout {
		display: grid;
		grid-template-columns: minmax(0, 1142px) 320px;
		gap: 20px;
		align-items: start;
		justify-content: center;
	}

	.arena-card,
	.ranking-card {
		background: var(--surface, #ffffff);
		border: 1px solid color-mix(in srgb, var(--text, #1f2937) 10%, transparent);
		border-radius: 24px;
		box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
	}

	.start-card {
		min-height: 820px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.start-scene {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		min-height: 780px;
	}

	.start-apple {
		width: 280px;
		height: 280px;
		border: 0;
		border-radius: 50%;
		background-color: #fff7ed;
		background-position: center;
		background-repeat: no-repeat;
		background-size: 72%;
		box-shadow: 0 24px 50px rgba(249, 115, 22, 0.18);
		cursor: pointer;
		position: relative;
		transition: transform 0.15s ease;
		overflow: hidden;
	}

	.start-apple:hover {
		transform: scale(1.03);
	}

	.start-apple span {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
		font-weight: 900;
		color: #fff;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
	}

	.status-bar {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
		padding: 20px 20px 0;
	}

	.status-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 14px 16px;
		border-radius: 18px;
		background: #f8fafc;
		border: 1px solid rgba(15, 23, 42, 0.08);
	}

	.status-card .label {
		font-size: 0.82rem;
		color: #64748b;
	}

	.status-card strong {
		font-size: 1.35rem;
		color: #0f172a;
	}

	.board {
		position: relative;
		width: min(1142px, calc(100% - 40px));
		aspect-ratio: 1142 / 700;
		height: auto;
		margin: 20px auto;
		border-radius: 24px;
		background: #ffffff;
		border: 1px solid rgba(15, 23, 42, 0.08);
		overflow: hidden;
		touch-action: none;
		user-select: none;
	}

	.board-surface {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.apple-cell {
		position: absolute;
		user-select: none;
	}

	.apple-cell.removed {
		pointer-events: none;
	}

	.apple-face {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		background-position: center;
		background-repeat: no-repeat;
		background-size: contain;
		user-select: none;
	}

	.apple-face span {
		font-size: 1.05rem;
		font-weight: 900;
		color: #ffffff;
		text-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
	}

	.apple-cell.selected .apple-face {
		filter: brightness(1.08);
		transform: scale(1.03);
	}

	.selection-box {
		position: absolute;
		border: 2px solid rgba(37, 99, 235, 0.65);
		background: rgba(37, 99, 235, 0.12);
		border-radius: 12px;
		pointer-events: none;
	}

	.overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(15, 23, 42, 0.42);
	}

	.overlay-card {
		width: min(420px, calc(100% - 32px));
		padding: 28px;
		border-radius: 24px;
		background: rgba(255, 255, 255, 0.96);
		text-align: center;
		box-shadow: 0 24px 60px rgba(15, 23, 42, 0.16);
	}

	.overlay-card h2,
	.overlay-card p {
		margin: 0;
	}

	.overlay-card h2 {
		font-size: 1.7rem;
	}

	.overlay-card p {
		margin-top: 10px;
		color: #475569;
	}

	.overlay-score {
		margin-top: 18px;
		font-size: 1.2rem;
		font-weight: 800;
	}

	.submit-row {
		display: flex;
		gap: 10px;
		margin-top: 18px;
	}

	.submit-row input,
	.submit-row button,
	.restart-button {
		border-radius: 14px;
		border: 1px solid rgba(15, 23, 42, 0.12);
		font: inherit;
	}

	.submit-row input {
		flex: 1;
		padding: 12px 14px;
		background: #ffffff;
	}

	.submit-row button,
	.restart-button {
		padding: 12px 16px;
		background: #111827;
		color: #ffffff;
		cursor: pointer;
	}

	.restart-button {
		margin-top: 12px;
		width: 100%;
	}

	.ranking-card {
		padding: 20px;
		position: sticky;
		top: 20px;
	}

	.ranking-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.ranking-header h2,
	.ranking-header span {
		margin: 0;
	}

	.ranking-header span {
		color: #64748b;
		font-size: 0.9rem;
	}

	.ranking-message {
		margin: 0;
		color: #64748b;
	}

	.ranking-message.error {
		color: #dc2626;
	}

	.ranking-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.ranking-list li {
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 16px;
		background: #f8fafc;
	}

	.rank {
		font-weight: 800;
		color: #ef4444;
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 1520px) {
		.game-layout {
			grid-template-columns: 1fr;
		}

		.ranking-card {
			position: static;
		}

		.board {
			width: min(1142px, calc(100% - 24px));
		}
	}

	:global(html[data-theme='dark']) .apple-page {
		color: #eef2ff;
	}

	:global(html[data-theme='dark']) .arena-card,
	:global(html[data-theme='dark']) .ranking-card {
		background: rgba(15, 23, 42, 0.88);
		border-color: rgba(255, 255, 255, 0.08);
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
	}

	:global(html[data-theme='dark']) .status-card {
		background: rgba(30, 41, 59, 0.92);
		border-color: rgba(255, 255, 255, 0.1);
	}

	:global(html[data-theme='dark']) .status-card .label {
		color: #cbd5e1;
	}

	:global(html[data-theme='dark']) .status-card strong {
		color: #f8fafc;
	}

	:global(html[data-theme='dark']) .board {
		background: #ffffff;
	}

	:global(html[data-theme='dark']) .overlay-card {
		background: rgba(15, 23, 42, 0.94);
		color: #f8fafc;
	}

	:global(html[data-theme='dark']) .start-apple {
		background-color: rgba(30, 41, 59, 0.96);
		box-shadow: 0 24px 50px rgba(0, 0, 0, 0.28);
	}

	:global(html[data-theme='dark']) .overlay-card p,
	:global(html[data-theme='dark']) .ranking-header span,
	:global(html[data-theme='dark']) .ranking-message {
		color: #cbd5e1;
	}

	:global(html[data-theme='dark']) .submit-row input {
		background: rgba(15, 23, 42, 0.9);
		color: #f8fafc;
		border-color: rgba(255, 255, 255, 0.14);
	}

	:global(html[data-theme='dark']) .submit-row button,
	:global(html[data-theme='dark']) .restart-button {
		background: #f8fafc;
		color: #0f172a;
	}

	:global(html[data-theme='dark']) .ranking-list li {
		background: rgba(30, 41, 59, 0.92);
	}
</style>
