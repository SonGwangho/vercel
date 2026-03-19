<script lang="ts">
	import type { GameCodeEntry } from "$lib";

	type PageData = {
		games: GameCodeEntry[];
		adminBasePath: string;
	};

	let { data } = $props<{ data: PageData }>();
	const quickLinks = $derived([
		{
			label: "Ranking Operations",
			description: "게임별 랭킹을 조회, 수정, 삭제하는 화면입니다.",
			href: `${data.adminBasePath}/rankings`
		},
		{
			label: "IP Ban Operations",
			description: "차단 목록을 등록, 조회, 해제하는 화면입니다.",
			href: `${data.adminBasePath}/ip-bans`
		}
	]);
</script>

<section class="dashboard">
	<section class="panel intro-panel">
		<p class="eyebrow">Overview</p>
		<h2>기능별 화면으로 분리된 관리자 대시보드</h2>
		<p class="copy">
			이제 랭킹 수정과 IP 차단은 각각 독립된 화면으로 이동합니다. 앞으로 새 기능이 생기면 같은 방식으로
			메뉴를 추가하면 됩니다.
		</p>
	</section>

	<section class="card-grid">
		{#each quickLinks as item}
			<a class="tool-card" href={item.href}>
				<span class="label">Module</span>
				<strong>{item.label}</strong>
				<p>{item.description}</p>
			</a>
		{/each}
	</section>
</section>

<style>
	.dashboard {
		display: grid;
		gap: 18px;
	}

	.panel,
	.tool-card {
		border: 1px solid var(--line);
		border-radius: 28px;
		background:
			radial-gradient(circle at top right, rgba(249, 115, 22, 0.08), transparent 28%),
			linear-gradient(180deg, var(--card) 0%, var(--surface) 100%);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
	}

	.intro-panel {
		padding: 22px;
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
		font-size: clamp(24px, 3vw, 34px);
		line-height: 1.08;
		letter-spacing: -0.04em;
	}

	.copy,
	.tool-card p {
		margin: 12px 0 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--muted);
	}

	.card-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
	}

	.tool-card {
		display: block;
		padding: 20px;
		text-decoration: none;
		color: inherit;
	}

	.label {
		display: block;
		font-size: 12px;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #c2410c;
	}

	.tool-card strong {
		display: block;
		margin-top: 10px;
		font-size: 22px;
		line-height: 1.2;
	}

	@media (max-width: 760px) {
		.card-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.intro-panel,
		.tool-card {
			padding: 16px;
			border-radius: 22px;
		}
	}
</style>
