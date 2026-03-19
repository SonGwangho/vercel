<script lang="ts">
	import type { AdminRankingListResponse, AdminRankingRecord, GameCodeEntry, RankingMutationResponse } from "$lib";

	type PageData = {
		games: GameCodeEntry[];
		adminBasePath: string;
	};

	type RankingEditState = {
		userName: string;
		scoreText: string;
	};

	let { data } = $props<{ data: PageData }>();

	const games = $derived(data.games);
	const selectedGame = $derived(
		games.find((game: GameCodeEntry) => String(game.gameCode) === selectedGameCode) ?? null
	);

	let selectedGameCode = $state<string>("all");
	let rankings = $state<AdminRankingRecord[]>([]);
	let rankingEdits = $state<Record<number, RankingEditState>>({});
	let rankingsLoading = $state(false);
	let rankingsMessage = $state("");

	function syncRankingEdits(items: AdminRankingRecord[]) {
		rankingEdits = Object.fromEntries(
			items.map((item) => [
				item.id,
				{
					userName: item.userName,
					scoreText: String(item.score)
				}
			])
		);
	}

	async function loadRankings() {
		rankingsLoading = true;
		rankingsMessage = "";

		try {
			const searchParams = new URLSearchParams({
				limit: "120"
			});

			if (selectedGameCode !== "all") {
				searchParams.set("gameCode", selectedGameCode);
			}

			const response = await fetch(`/api/admin/rankings?${searchParams.toString()}`);
			const payload = (await response.json()) as AdminRankingListResponse & { message?: string };

			if (!response.ok) {
				throw new Error(payload.message ?? "Failed to load rankings.");
			}

			rankings = payload.rankings;
			syncRankingEdits(payload.rankings);
		} catch (error) {
			rankings = [];
			syncRankingEdits([]);
			rankingsMessage = error instanceof Error ? error.message : "Failed to load rankings.";
		} finally {
			rankingsLoading = false;
		}
	}

	function updateRankingEdit(id: number, field: keyof RankingEditState, value: string) {
		rankingEdits = {
			...rankingEdits,
			[id]: {
				...(rankingEdits[id] ?? { userName: "", scoreText: "" }),
				[field]: value
			}
		};
	}

	async function saveRanking(id: number) {
		const draft = rankingEdits[id];
		rankingsMessage = "";

		if (!draft) {
			return;
		}

		try {
			const response = await fetch(`/api/admin/rankings/${id}`, {
				method: "PATCH",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					userName: draft.userName,
					score: Number(draft.scoreText)
				})
			});
			const payload = (await response.json()) as RankingMutationResponse & { message?: string };

			if (!response.ok) {
				throw new Error(payload.message ?? "Failed to update ranking.");
			}

			rankings = rankings.map((item) =>
				item.id === id
					? {
							...item,
							userName: payload.ranking.userName,
							score: payload.ranking.score,
							updatedAt: payload.ranking.updatedAt
						}
					: item
			);
			updateRankingEdit(id, "userName", payload.ranking.userName);
			updateRankingEdit(id, "scoreText", String(payload.ranking.score));
			rankingsMessage = `Saved ranking #${id}.`;
		} catch (error) {
			rankingsMessage = error instanceof Error ? error.message : "Failed to update ranking.";
		}
	}

	async function removeRanking(id: number) {
		rankingsMessage = "";

		try {
			const response = await fetch(`/api/admin/rankings/${id}`, {
				method: "DELETE"
			});
			const payload = (await response.json()) as { message?: string };

			if (!response.ok) {
				throw new Error(payload.message ?? "Failed to delete ranking.");
			}

			rankings = rankings.filter((item) => item.id !== id);
			const { [id]: _, ...rest } = rankingEdits;
			rankingEdits = rest;
			rankingsMessage = `Deleted ranking #${id}.`;
		} catch (error) {
			rankingsMessage = error instanceof Error ? error.message : "Failed to delete ranking.";
		}
	}

	function formatDateTime(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
	}

	$effect(() => {
		if (games[0]?.gameCode && selectedGameCode === "all") {
			selectedGameCode = String(games[0].gameCode);
		}
	});

	$effect(() => {
		if (selectedGameCode !== "all") {
			void loadRankings();
		}
	});
</script>

<section class="page-grid">
	<section class="panel">
		<div class="topbar">
			<div>
				<p class="eyebrow">Ranking Ops</p>
				<h2>{selectedGame?.gameName ?? "Ranking Manager"}</h2>
			</div>
			<button type="button" class="neutral-btn" onclick={() => void loadRankings()}>
				Refresh
			</button>
		</div>

		<div class="section-summary">
			<p>랭킹 수정 전용 화면입니다. 게임별 점수와 유저명을 개별 편집할 수 있습니다.</p>
			<a href={`${data.adminBasePath}/ip-bans`} class="summary-link">Go To IP Ban</a>
		</div>

		<div class="tab-strip" role="tablist" aria-label="Game rankings">
			{#each games as game}
				<button
					type="button"
					role="tab"
					class={`tab-btn ${selectedGameCode === String(game.gameCode) ? "active" : ""}`}
					aria-selected={selectedGameCode === String(game.gameCode)}
					onclick={() => {
						selectedGameCode = String(game.gameCode);
					}}
				>
					<span>{game.gameName}</span>
				</button>
			{/each}
		</div>

		{#if rankingsMessage}
			<p class="message">{rankingsMessage}</p>
		{/if}

		{#if rankingsLoading}
			<p class="empty-state">Loading rankings...</p>
		{:else if rankings.length === 0}
			<p class="empty-state">No rankings found for this game.</p>
		{:else}
			<div class="ranking-table">
				<div class="table-head">
					<span>ID</span>
					<span>User</span>
					<span>Score</span>
					<span>IP</span>
					<span>Created</span>
					<span>Actions</span>
				</div>

				{#each rankings as ranking}
					<div class="table-row">
						<div class="cell cell-id" data-label="ID">#{ranking.id}</div>
						<div class="cell" data-label="User">
							<input
								type="text"
								value={rankingEdits[ranking.id]?.userName ?? ""}
								oninput={(event) =>
									updateRankingEdit(
										ranking.id,
										"userName",
										(event.currentTarget as HTMLInputElement).value
									)}
							/>
						</div>
						<div class="cell" data-label="Score">
							<input
								type="number"
								step="any"
								value={rankingEdits[ranking.id]?.scoreText ?? ""}
								oninput={(event) =>
									updateRankingEdit(
										ranking.id,
										"scoreText",
										(event.currentTarget as HTMLInputElement).value
									)}
							/>
						</div>
						<div class="cell meta-cell" data-label="IP">
							<span>{ranking.ipAddress ?? "No IP"}</span>
						</div>
						<div class="cell meta-cell" data-label="Created">
							<span>{formatDateTime(ranking.createdAt)}</span>
						</div>
						<div class="cell actions-cell" data-label="Actions">
							<button type="button" class="save-btn" onclick={() => void saveRanking(ranking.id)}>
								Save
							</button>
							<button type="button" class="danger-btn" onclick={() => void removeRanking(ranking.id)}>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</section>

<style>
	.page-grid {
		display: grid;
	}

	.panel {
		border: 1px solid var(--line);
		border-radius: 28px;
		padding: 22px;
		background:
			radial-gradient(circle at top right, rgba(249, 115, 22, 0.08), transparent 28%),
			linear-gradient(180deg, var(--card) 0%, var(--surface) 100%);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
	}

	.topbar,
	.section-summary {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
	}

	.eyebrow {
		margin: 0 0 8px;
		font-size: 12px;
		font-weight: 900;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #c2410c;
	}

	h2 {
		margin: 0;
		font-size: clamp(26px, 3vw, 34px);
		line-height: 1.05;
		letter-spacing: -0.04em;
	}

	.section-summary {
		margin-top: 14px;
	}

	.section-summary p,
	.message,
	.empty-state {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--muted);
	}

	.summary-link {
		padding: 10px 14px;
		border-radius: 999px;
		background: #fff7ed;
		color: #9a3412;
		font-size: 13px;
		font-weight: 800;
		text-decoration: none;
		white-space: nowrap;
	}

	.tab-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 18px;
	}

	.tab-btn {
		padding: 12px 16px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: #fff7ed;
		color: #7c2d12;
		font-size: 14px;
		font-weight: 800;
		cursor: pointer;
	}

	.tab-btn.active {
		background: #ea580c;
		border-color: #ea580c;
		color: #fff;
		box-shadow: 0 14px 24px rgba(234, 88, 12, 0.18);
	}

	.ranking-table {
		display: grid;
		gap: 10px;
		margin-top: 18px;
	}

	.table-head,
	.table-row {
		display: grid;
		grid-template-columns: 90px minmax(0, 1.1fr) minmax(120px, 0.7fr) minmax(160px, 0.9fr) minmax(180px, 1fr) auto;
		gap: 10px;
		align-items: center;
	}

	.table-head {
		padding: 0 12px;
		font-size: 12px;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted);
	}

	.table-row {
		padding: 12px;
		border-radius: 20px;
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.78);
	}

	.cell {
		min-width: 0;
	}

	.cell::before {
		display: none;
		content: attr(data-label);
		margin-bottom: 6px;
		font-size: 11px;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #94a3b8;
	}

	.cell-id {
		font-size: 18px;
		font-weight: 900;
	}

	.meta-cell span {
		display: block;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.5;
		color: var(--muted);
		word-break: break-word;
	}

	.actions-cell {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		justify-content: flex-end;
	}

	input {
		width: 100%;
		height: 46px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 16px;
		background: #fff;
		color: var(--ink);
		font-size: 14px;
	}

	button {
		border: none;
		cursor: pointer;
	}

	.save-btn,
	.neutral-btn,
	.danger-btn {
		height: 40px;
		padding: 0 14px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 900;
	}

	.save-btn {
		background: #15803d;
		color: #f0fdf4;
	}

	.neutral-btn {
		background: #e2e8f0;
		color: #0f172a;
	}

	.danger-btn {
		background: #dc2626;
		color: #fff;
	}

	.message,
	.empty-state {
		margin-top: 14px;
	}

	@media (max-width: 860px) {
		.table-head {
			display: none;
		}

		.topbar,
		.section-summary {
			flex-direction: column;
			align-items: stretch;
		}

		.panel {
			padding: 18px;
		}

		.table-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 12px;
			padding: 16px;
		}

		.cell {
			display: grid;
			gap: 6px;
		}

		.cell::before {
			display: block;
		}

		.actions-cell {
			justify-content: flex-start;
		}
	}

	@media (max-width: 640px) {
		.panel {
			padding: 16px;
			border-radius: 22px;
		}

		.tab-strip {
			flex-wrap: nowrap;
			overflow-x: auto;
			padding-bottom: 6px;
		}

		.tab-btn,
		.topbar button,
		.actions-cell button,
		.summary-link {
			width: 100%;
		}

		.actions-cell {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}
	}

	:global(html[data-theme="dark"]) .panel,
	:global(html[data-theme="dark"]) .table-row,
	:global(html[data-theme="dark"]) input {
		background: rgba(15, 23, 42, 0.78);
		color: #f8fafc;
	}

	:global(html[data-theme="dark"]) .tab-btn,
	:global(html[data-theme="dark"]) .summary-link {
		background: #2b190f;
		color: #fed7aa;
	}

	:global(html[data-theme="dark"]) .tab-btn.active {
		background: #f97316;
		color: #111827;
	}

	:global(html[data-theme="dark"]) .neutral-btn {
		background: #334155;
		color: #e2e8f0;
	}
</style>
