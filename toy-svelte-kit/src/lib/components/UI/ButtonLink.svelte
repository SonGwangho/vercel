<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		children,
		href,
		variant = "secondary"
	}: {
		children?: Snippet;
		href: string;
		variant?: "primary" | "secondary";
	} = $props();
</script>

<a class={`ui-button-link ${variant}`} {href}>
	{@render children?.()}
</a>

<style>
	.ui-button-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 42px;
		padding: 0 16px;
		border: 1px solid var(--line);
		border-radius: 999px;
		font-size: 13px;
		font-weight: 800;
		text-decoration: none;
		white-space: nowrap;
	}

	.ui-button-link.primary {
		border-color: color-mix(in srgb, var(--brand) 80%, transparent);
		background: var(--brand);
		color: #fff;
	}

	.ui-button-link.secondary {
		background: color-mix(in srgb, var(--surface-strong) 88%, transparent);
		color: var(--brand-strong);
	}

	@media (max-width: 720px) {
		.ui-button-link {
			width: 100%;
		}
	}
</style>
