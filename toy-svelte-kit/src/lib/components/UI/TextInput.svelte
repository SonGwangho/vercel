<script lang="ts">
	import type { HTMLInputAttributes } from "svelte/elements";

	let {
		label,
		name,
		type = "text",
		autocomplete,
		required = false
	}: {
		label: string;
		name: string;
		type?: HTMLInputAttributes["type"];
		autocomplete?: HTMLInputAttributes["autocomplete"];
		required?: boolean;
	} = $props();
</script>

<label class="ui-field">
	<span>{label}</span>
	<input {type} {name} {autocomplete} {required} />
</label>

<style>
	.ui-field span {
		display: block;
		margin-bottom: 8px;
		color: var(--muted);
		font-size: 13px;
		font-weight: 600;
	}

	.ui-field input {
		width: 100%;
		height: 48px;
		padding: 0 16px;
		border: 1px solid var(--line-strong);
		border-radius: var(--control-radius);
		background: var(--surface);
		color: var(--ink);
		caret-color: var(--brand);
		transition: border-color 0.18s ease, background-color 0.18s ease;
	}

	.ui-field input:hover {
		border-color: var(--muted);
	}

	.ui-field input:focus {
		border-color: var(--brand);
		outline: 3px solid var(--focus-ring);
		outline-offset: 1px;
	}
</style>
