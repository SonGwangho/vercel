<script lang="ts">
  import type { LoungeFoodIconProps } from "$lib/types/Lounge";
  let { kind, size = 36 }: LoungeFoodIconProps = $props();
</script>

<svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
  {#if kind === "rice"}
    <path d="m21 7-16 28a4 4 0 0 0 3.5 6h31a4 4 0 0 0 3.5-6L27 7a3.5 3.5 0 0 0-6 0Z" fill="#FAF8EF" stroke="#B9BDB3" stroke-width="2" />
    <path d="M17 27h14v14H17z" fill="#35584D" /><path d="M11 32h2m5-14h2m12 5h2m-7-9h1" stroke="#D0C9B7" stroke-width="2" stroke-linecap="round" />
  {:else if kind === "chicken"}
    <path d="m16 31-8 8m3-2 2 5m-7-7 5 2" stroke="#F7F4E9" stroke-width="7" stroke-linecap="round" />
    <path d="M17 30C9 21 21 7 32 8c12 2 11 15 3 21-5 4-12 7-18 1Z" fill="#D78A3E" stroke="#AA6327" stroke-width="2" /><path d="M24 15c3-3 7-3 10-1" stroke="#F2BA71" stroke-width="3" stroke-linecap="round" />
  {:else}
    <path d="M8 8c11-4 23-1 32 7L12 42 8 8Z" fill="#F4D079" stroke="#B98039" stroke-width="2" stroke-linejoin="round" /><path d="M8 8c11-4 23-1 32 7" stroke="#C98F4C" stroke-width="7" stroke-linecap="round" /><circle cx="18" cy="18" r="4" fill="#C45849" /><circle cx="27" cy="22" r="3.5" fill="#C45849" /><circle cx="16" cy="30" r="3" fill="#C45849" /><path d="m22 30 3-2m-9-6 2 2" stroke="#5C8B50" stroke-width="2.5" stroke-linecap="round" />
  {/if}
</svg>
