<script lang="ts">
  import icons from "$lib/assets/data/lounge/fish-icons.json";
  import { describeFish } from "$lib/lounge/fishing";
  import type { LoungeFishIconProps } from "$lib/types/Lounge";

  let { kind }: LoungeFishIconProps = $props();
  const icon = $derived(icons[kind]);
</script>

<svg viewBox="0 0 50 32" width="42" height="30" aria-hidden="true" style={`color:${describeFish(kind).color}`}>
  <path d={icon.body} fill="currentColor" />
  <path d={icon.detail} fill="none" stroke="var(--text-strong)" stroke-width="1" stroke-linecap="round" opacity=".6" />
  {#each icon.eyes as [x, y]}<circle cx={x} cy={y} r="1.25" fill="var(--text-strong)" />{/each}
</svg>
