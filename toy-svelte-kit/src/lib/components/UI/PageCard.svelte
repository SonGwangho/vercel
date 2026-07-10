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
		padding: 28px;
		border: 1px solid var(--line);
		border-radius: var(--panel-radius);
		background: var(--surface);
		box-shadow: var(--shadow-card);
	}

	@media (max-width: 720px) {
		.ui-page-card {
			padding: 22px 18px;
		}
	}
</style>
