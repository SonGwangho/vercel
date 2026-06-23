<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		children,
		class: className = ""
	}: {
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<section class={`ui-page-card ${className}`}>
	{@render children?.()}
</section>

<style>
	.ui-page-card {
		padding: 30px 28px;
		border: 1px solid var(--line);
		border-radius: var(--panel-radius);
		background: color-mix(in srgb, var(--surface) 96%, transparent);
		box-shadow: var(--shadow-card);
	}

	@media (max-width: 720px) {
		.ui-page-card {
			padding: 22px 18px;
			border-radius: 20px;
		}
	}
</style>
