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
		border-radius: var(--control-radius);
		font-size: 13px;
		font-weight: 800;
		text-decoration: none;
		white-space: nowrap;
		transition:
			background-color 0.16s ease,
			border-color 0.16s ease,
			color 0.16s ease,
			transform 0.16s ease;
	}

	.ui-button-link:hover {
		transform: translateY(-1px);
	}

	.ui-button-link.primary {
		border-color: color-mix(in srgb, var(--brand) 80%, transparent);
		background: var(--brand);
		color: var(--on-brand);
	}

	.ui-button-link.secondary {
		background: var(--surface-strong);
		color: var(--brand-strong);
	}

	@media (max-width: 720px) {
		.ui-button-link {
			width: 100%;
		}
	}
</style>
