<script lang="ts">
  import icons from "$lib/assets/data/lounge/insect-icons.json";
  import { describeInsect } from "$lib/lounge/insects";
  import type { LoungeInsectIconProps } from "$lib/types/LoungeInsect";
  let { kind }: LoungeInsectIconProps = $props();
  const icon = $derived(icons[kind]);
</script>
<svg viewBox="0 0 50 42" width="42" height="34" aria-hidden="true" style={`color:${describeInsect(kind).color}`}>
  <path d={icon.body} fill="currentColor" />
  <path d={icon.detail} fill="none" stroke="var(--text-strong)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  {#each icon.eyes as [x, y]}<circle cx={x} cy={y} r="1.1" fill="var(--text-strong)" />{/each}
</svg>
