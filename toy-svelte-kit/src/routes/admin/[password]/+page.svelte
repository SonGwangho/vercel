<script lang="ts">
	import { onMount } from "svelte";

	import type {
		AdminRankingRecord,
		AdminRankingListResponse,
		GameCodeEntry,
		IpBanListResponse,
		IpBanRecord,
		RankingMutationResponse
	} from "$lib";

	type PageData = {
		games: GameCodeEntry[];
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

	let bans = $state<IpBanRecord[]>([]);
	let bansLoading = $state(false);
	let bansMessage = $state("");
	let banIpAddress = $state("");
	let banNote = $state("");

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

	async function loadBans() {
		bansLoading = true;
		bansMessage = "";

		try {
			const response = await fetch("/api/admin/ip-bans");
			const payload = (await response.json()) as IpBanListResponse & { message?: string };

			if (!response.ok) {
				throw new Error(payload.message ?? "Failed to load IP bans.");
			}

			bans = payload.bans;
		} catch (error) {
			bans = [];
			bansMessage = error instanceof Error ? error.message : "Failed to load IP bans.";
		} finally {
			bansLoading = false;
		}
	}

	async function refreshAll() {
		await Promise.all([loadRankings(), loadBans()]);
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

	async function createBan() {
		bansMessage = "";

		try {
			const response = await fetch("/api/admin/ip-bans", {
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					ipAddress: banIpAddress,
					note: banNote
				})
			});
			const payload = (await response.json()) as { ban?: IpBanRecord; message?: string };

			if (!response.ok || !payload.ban) {
				throw new Error(payload.message ?? "Failed to create IP ban.");
			}

			bans = [payload.ban, ...bans.filter((item) => item.id !== payload.ban?.id)];
			banIpAddress = "";
			banNote = "";
			bansMessage = `Blocked ${payload.ban.ipAddress}.`;
		} catch (error) {
			bansMessage = error instanceof Error ? error.message : "Failed to create IP ban.";
		}
	}

	async function quickBan(ipAddress: string | null) {
		if (!ipAddress) {
			bansMessage = "This ranking does not have an IP address.";
			return;
		}

		banIpAddress = ipAddress;
		banNote = "Created from ranking panel";
		await createBan();
	}

	async function removeBan(id: number) {
		bansMessage = "";

		try {
			const response = await fetch(`/api/admin/ip-bans/${id}`, {
				method: "DELETE"
			});
			const payload = (await response.json()) as { message?: string };

			if (!response.ok) {
				throw new Error(payload.message ?? "Failed to delete IP ban.");
			}

			bans = bans.filter((item) => item.id !== id);
			bansMessage = `Removed ban #${id}.`;
		} catch (error) {
			bansMessage = error instanceof Error ? error.message : "Failed to delete IP ban.";
		}
	}

	function formatDateTime(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
	}

	onMount(() => {
		if (games[0]?.gameCode) {
			selectedGameCode = String(games[0].gameCode);
		}

		void refreshAll();
	});
</script>

<section class="admin-page">
	<div class="workspace">
		<section class="surface ranking-surface">
			<div class="ranking-topbar">
				<div>
					<p class="eyebrow">Game Tabs</p>
					<h1>{selectedGame?.gameName ?? "Ranking Manager"}</h1>
				</div>
				<button type="button" class="neutral-btn" onclick={() => void loadRankings()}>
					Refresh
				</button>
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
							void loadRankings();
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
							<div class="cell cell-id">#{ranking.id}</div>
							<div class="cell">
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
							<div class="cell">
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
							<div class="cell meta-cell">
								<span>{ranking.ipAddress ?? "No IP"}</span>
							</div>
							<div class="cell meta-cell">
								<span>{formatDateTime(ranking.createdAt)}</span>
							</div>
							<div class="cell actions-cell">
								<button type="button" class="save-btn" onclick={() => void saveRanking(ranking.id)}>
									Save
								</button>
								<button
									type="button"
									class="neutral-btn"
									disabled={!ranking.ipAddress}
									onclick={() => void quickBan(ranking.ipAddress)}
								>
									Ban IP
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

		<aside class="side-stack">
			<section class="surface side-panel">
				<div class="side-head">
					<div>
						<p class="eyebrow">IP Ban</p>
						<h2>Block Access</h2>
					</div>
					<button type="button" class="neutral-btn" onclick={() => void loadBans()}>
						Refresh
					</button>
				</div>

				<div class="form-grid">
					<label>
						<span>IP address</span>
						<input type="text" bind:value={banIpAddress} placeholder="127.0.0.1" />
					</label>
					<label>
						<span>Note</span>
						<input type="text" bind:value={banNote} placeholder="Reason or memo" />
					</label>
				</div>

				<div class="form-actions">
					<button type="button" class="save-btn wide-btn" onclick={() => void createBan()}>
						Save Ban
					</button>
				</div>

				{#if bansMessage}
					<p class="message">{bansMessage}</p>
				{/if}
			</section>

			<section class="surface side-panel">
				<div class="side-head">
					<div>
						<p class="eyebrow">Blocked IPs</p>
						<h2>{bans.length}</h2>
					</div>
				</div>

				{#if bansLoading}
					<p class="empty-state">Loading blocked IPs...</p>
				{:else if bans.length === 0}
					<p class="empty-state">No blocked IPs.</p>
				{:else}
					<div class="ban-list">
						{#each bans as ban}
							<div class="ban-item">
								<div class="ban-copy">
									<strong>{ban.ipAddress}</strong>
									<p>{ban.note || "No note"}</p>
									<small>{formatDateTime(ban.createdAt)}</small>
								</div>
								<button type="button" class="danger-btn" onclick={() => void removeBan(ban.id)}>
									Remove
								</button>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		</aside>
	</div>
</section>

<style>
	.admin-page {
		--ink: #111827;
		--muted: #6b7280;
		--line: #d7dfeb;
		--surface: #f8fafc;
		--card: #ffffff;
		color: var(--ink);
		padding: 10px 0 36px;
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.85fr);
		gap: 18px;
		align-items: start;
	}

	.surface {
		border: 1px solid var(--line);
		border-radius: 28px;
		background:
			radial-gradient(circle at top right, rgba(249, 115, 22, 0.08), transparent 26%),
			linear-gradient(180deg, var(--card) 0%, var(--surface) 100%);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
	}

	.ranking-surface,
	.side-panel {
		padding: 22px;
	}

	.side-stack {
		display: grid;
		gap: 18px;
	}

	.ranking-topbar,
	.side-head,
	.ban-item {
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

	h1,
	h2 {
		margin: 0;
		letter-spacing: -0.04em;
		color: var(--ink);
	}

	h1 {
		font-size: clamp(28px, 4vw, 40px);
		line-height: 1.02;
	}

	h2 {
		font-size: 28px;
		line-height: 1.05;
	}

	.tab-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 18px;
		padding-bottom: 2px;
	}

	.tab-btn {
		padding: 12px 16px;
		border-radius: 16px;
		border: 1px solid var(--line);
		background: #fff7ed;
		color: #7c2d12;
		font-size: 14px;
		font-weight: 800;
		cursor: pointer;
		transition:
			transform 0.14s ease,
			box-shadow 0.14s ease,
			border-color 0.14s ease;
	}

	.tab-btn.active {
		transform: translateY(-1px);
		border-color: #ea580c;
		background: #ea580c;
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

	.cell-id {
		font-size: 18px;
		font-weight: 900;
		color: #0f172a;
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

	.form-grid {
		display: grid;
		gap: 14px;
		margin-top: 16px;
	}

	label span {
		display: block;
		margin-bottom: 8px;
		font-size: 13px;
		font-weight: 800;
		color: var(--muted);
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

	.wide-btn {
		width: 100%;
	}

	.form-actions {
		margin-top: 14px;
	}

	.message,
	.empty-state,
	.ban-copy p,
	.ban-copy small {
		margin: 14px 0 0;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.6;
		color: var(--muted);
	}

	.ban-list {
		display: grid;
		gap: 12px;
		margin-top: 18px;
	}

	.ban-item {
		padding: 14px;
		border-radius: 18px;
		border: 1px solid var(--line);
		background: rgba(255, 255, 255, 0.82);
	}

	.ban-copy strong {
		display: block;
		font-size: 16px;
		line-height: 1.3;
		color: var(--ink);
	}

	.ban-copy p {
		margin-top: 4px;
	}

	.ban-copy small {
		display: block;
		margin-top: 6px;
	}

	@media (max-width: 1080px) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 860px) {
		.table-head {
			display: none;
		}

		.table-row,
		.ban-item,
		.ranking-topbar,
		.side-head {
			grid-template-columns: minmax(0, 1fr);
			flex-direction: column;
		}

		.table-row {
			display: grid;
		}

		.actions-cell {
			justify-content: flex-start;
		}
	}

	:global(html[data-theme="dark"]) .admin-page {
		--ink: #f8fafc;
		--muted: #cbd5e1;
		--line: rgba(255, 255, 255, 0.08);
		--surface: #111827;
		--card: #172033;
	}

	:global(html[data-theme="dark"]) .admin-page .tab-btn {
		background: #2b190f;
		color: #fed7aa;
	}

	:global(html[data-theme="dark"]) .admin-page .tab-btn.active {
		background: #f97316;
		color: #111827;
	}

	:global(html[data-theme="dark"]) .admin-page .table-row,
	:global(html[data-theme="dark"]) .admin-page .ban-item,
	:global(html[data-theme="dark"]) .admin-page input {
		background: rgba(15, 23, 42, 0.78);
		color: #f8fafc;
	}

	:global(html[data-theme="dark"]) .admin-page .neutral-btn {
		background: #334155;
		color: #e2e8f0;
	}
 </style>
