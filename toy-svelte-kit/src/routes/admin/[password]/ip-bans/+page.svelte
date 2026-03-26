<script lang="ts">
	import type { GameCodeEntry, IpBanListResponse, IpBanRecord } from "$lib";

	type PageData = {
		games: GameCodeEntry[];
		adminBasePath: string;
	};

	let { data } = $props<{ data: PageData }>();

	let bans = $state<IpBanRecord[]>([]);
	let bansLoading = $state(false);
	let bansMessage = $state("");
	let banIpAddress = $state("");
	let banNote = $state("");

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

	$effect(() => {
		void loadBans();
	});
</script>

<section class="page-grid">
	<div class="stack">
		<section class="panel">
			<div class="topbar">
				<div>
					<p class="eyebrow">Access Control</p>
					<h2>IP Ban Operations</h2>
				</div>
				<button type="button" class="neutral-btn" onclick={() => void loadBans()}>
					Refresh
				</button>
			</div>

			<div class="section-summary">
				<a href={`${data.adminBasePath}/rankings`} class="summary-link">Go To Rankings</a>
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

		<section class="panel">
			<div class="topbar compact">
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
	</div>
</section>

<style>
	.page-grid,
	.stack,
	.ban-list {
		display: grid;
		gap: 18px;
	}

	.panel,
	.ban-item {
		border: 1px solid var(--line);
		border-radius: var(--panel-radius);
		background:
			radial-gradient(circle at top right, rgba(249, 115, 22, 0.08), transparent 28%),
			linear-gradient(180deg, var(--card) 0%, var(--surface) 100%);
		box-shadow: var(--shadow-card);
	}

	.panel {
		padding: 24px;
	}

	.topbar,
	.section-summary,
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

	h2 {
		margin: 0;
		font-size: clamp(28px, 3vw, 36px);
		line-height: 1.05;
		letter-spacing: -0.04em;
	}

	.section-summary {
		margin-top: 14px;
	}

	.message,
	.empty-state,
	.ban-copy p,
	.ban-copy small {
		margin: 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--muted);
	}

	.summary-link {
		padding: 11px 16px;
		border-radius: 999px;
		background: #fff7ed;
		color: #9a3412;
		font-size: 13px;
		font-weight: 800;
		text-decoration: none;
		white-space: nowrap;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
		margin-top: 20px;
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
		height: 48px;
		padding: 0 16px;
		border: 1px solid var(--line);
		border-radius: 18px;
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
		min-height: 42px;
		padding: 0 16px;
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

	.form-actions,
	.message {
		margin-top: 14px;
	}

	.wide-btn {
		width: 100%;
	}

	.ban-item {
		padding: 20px;
	}

	.ban-copy strong {
		display: block;
		font-size: 16px;
		line-height: 1.3;
	}

	.ban-copy p {
		margin-top: 4px;
	}

	.ban-copy small {
		display: block;
		margin-top: 6px;
	}

	@media (max-width: 860px) {
		.topbar,
		.section-summary,
		.ban-item,
		.form-grid {
			grid-template-columns: minmax(0, 1fr);
			flex-direction: column;
			align-items: stretch;
		}

		.panel {
			padding: 20px;
		}
	}

	@media (max-width: 640px) {
		.panel,
		.ban-item {
			padding: 20px;
			border-radius: 24px;
		}

		.topbar button,
		.summary-link,
		.danger-btn {
			width: 100%;
		}
	}

	:global(html[data-theme="dark"]) .panel,
	:global(html[data-theme="dark"]) .ban-item,
	:global(html[data-theme="dark"]) input {
		background: rgba(15, 23, 42, 0.78);
		color: #f8fafc;
	}

	:global(html[data-theme="dark"]) .summary-link {
		background: #2b190f;
		color: #fed7aa;
	}

	:global(html[data-theme="dark"]) .neutral-btn {
		background: #334155;
		color: #e2e8f0;
	}
</style>


