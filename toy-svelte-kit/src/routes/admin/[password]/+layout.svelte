<script lang="ts">
	import { page } from "$app/state";
	import type { GameCodeEntry } from "$lib";

	type LayoutData = {
		games: GameCodeEntry[];
		adminBasePath: string;
	};

	let { data, children } = $props<{ data: LayoutData; children: import("svelte").Snippet }>();

	const navItems = $derived([
		{
			label: "Overview",
			href: data.adminBasePath
		},
		{
			label: "Ranking Ops",
			href: `${data.adminBasePath}/rankings`
		},
		{
			label: "IP Ban Ops",
			href: `${data.adminBasePath}/ip-bans`
		}
	]);

	function isActive(href: string) {
		return page.url.pathname === href;
	}
</script>

<section class="admin-shell">
	<section class="admin-hero">
		<div>
			<p class="eyebrow">Admin Console</p>
			<h1>운영 기능을 섹션 단위로 확장하는 관리자 화면</h1>
			<p class="hero-copy">
				랭킹 수정과 IP 차단을 별도 화면으로 분리했고, 이후 기능도 같은 네비게이션 구조 안에
				자연스럽게 추가할 수 있게 정리했습니다.
			</p>
		</div>

		<div class="hero-badges">
			<div class="hero-badge">
				<span>Games</span>
				<strong>{data.games.length}</strong>
			</div>
			<div class="hero-badge">
				<span>Modules</span>
				<strong>{navItems.length}</strong>
			</div>
		</div>
	</section>

	<div class="shell-grid">
		<aside class="admin-nav">
			<div class="nav-card">
				<p class="eyebrow">Operations</p>
				<h2>Admin Menu</h2>
				<nav class="nav-links" aria-label="Admin sections">
					{#each navItems as item}
						<a href={item.href} class:active={isActive(item.href)}>{item.label}</a>
					{/each}
				</nav>
			</div>

			<div class="nav-card note-card">
				<strong>Available Games</strong>
				<p>{data.games.map((game: GameCodeEntry) => game.gameName).join(" / ")}</p>
			</div>
		</aside>

		<div class="content-slot">
			{@render children()}
		</div>
	</div>
</section>

<style>
	.admin-shell {
		--ink: #111827;
		--muted: #6b7280;
		--line: #d7dfeb;
		--surface: #f8fafc;
		--card: #ffffff;
		padding: 10px 0 36px;
		color: var(--ink);
	}

	.admin-hero,
	.nav-card {
		border: 1px solid var(--line);
		border-radius: 28px;
		background:
			radial-gradient(circle at top right, rgba(249, 115, 22, 0.08), transparent 28%),
			linear-gradient(180deg, var(--card) 0%, var(--surface) 100%);
		box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
	}

	.admin-hero {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(220px, 0.65fr);
		gap: 18px;
		padding: 24px;
		margin-bottom: 18px;
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
	}

	h1 {
		font-size: clamp(28px, 4vw, 40px);
		line-height: 1.04;
	}

	h2 {
		font-size: 24px;
		line-height: 1.08;
	}

	.hero-copy,
	.note-card p {
		margin: 12px 0 0;
		font-size: 14px;
		line-height: 1.7;
		color: var(--muted);
	}

	.hero-badges {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
		align-self: end;
	}

	.hero-badge {
		padding: 16px;
		border: 1px solid var(--line);
		border-radius: 20px;
		background: rgba(255, 255, 255, 0.72);
	}

	.hero-badge span {
		display: block;
		font-size: 12px;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #c2410c;
	}

	.hero-badge strong {
		display: block;
		margin-top: 10px;
		font-size: 36px;
		line-height: 1;
	}

	.shell-grid {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: 18px;
		align-items: start;
	}

	.admin-nav {
		display: grid;
		gap: 18px;
		position: sticky;
		top: 82px;
	}

	.nav-card {
		padding: 20px;
	}

	.nav-links {
		display: grid;
		gap: 8px;
		margin-top: 14px;
	}

	.nav-links a {
		padding: 12px 14px;
		border-radius: 16px;
		border: 1px solid var(--line);
		background: rgba(255, 247, 237, 0.8);
		color: #7c2d12;
		font-size: 14px;
		font-weight: 800;
		text-decoration: none;
	}

	.nav-links a.active {
		background: #ea580c;
		border-color: #ea580c;
		color: #fff;
		box-shadow: 0 14px 24px rgba(234, 88, 12, 0.18);
	}

	.note-card strong {
		font-size: 14px;
	}

	.content-slot {
		min-width: 0;
	}

	@media (max-width: 1080px) {
		.admin-hero,
		.shell-grid {
			grid-template-columns: minmax(0, 1fr);
		}

		.admin-nav,
		.hero-badges {
			position: static;
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 640px) {
		.admin-shell {
			padding-bottom: 24px;
		}

		.admin-hero,
		.nav-card {
			padding: 16px;
			border-radius: 22px;
		}

		.hero-badges,
		.admin-nav {
			gap: 14px;
		}

		.nav-links {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	:global(html[data-theme="dark"]) .admin-shell {
		--ink: #f8fafc;
		--muted: #cbd5e1;
		--line: rgba(255, 255, 255, 0.08);
		--surface: #111827;
		--card: #172033;
	}

	:global(html[data-theme="dark"]) .admin-shell .nav-links a,
	:global(html[data-theme="dark"]) .admin-shell .hero-badge {
		background: rgba(15, 23, 42, 0.78);
		color: #fed7aa;
	}

	:global(html[data-theme="dark"]) .admin-shell .nav-links a.active {
		background: #f97316;
		color: #111827;
	}
</style>
