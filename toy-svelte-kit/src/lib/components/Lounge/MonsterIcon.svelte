<script lang="ts">
  import { describeMonster } from "$lib/lounge/monsters";
  import type { LoungeMonsterIconProps } from "$lib/types/LoungeMonster";
  let { kind }: LoungeMonsterIconProps = $props();
  const species = $derived(describeMonster(kind));
</script>

<svg viewBox="0 0 120 96" fill="none" stroke="#38463f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if kind === "hornRabbit"}
    <path fill={species.color} d="M24 70c-8-9-2-25 11-26 11-1 22 7 23 20l-1 13H27l-3-7Z" />
    <path fill={species.color} d="M60 46C44 24 43 8 49 7c6-1 13 14 17 32C64 18 69 5 74 7c6 2 4 22-1 37 13 4 19 18 12 28-5 8-22 10-31 3-10-8-6-23 6-29Z" />
    <path fill="#d6b86b" d="m83 47 10-18-2 25Z" /><path fill="#f5e7d0" d="M37 72c-7-5-12-2-14 7h26m16-6-2 7h20" />
    <path stroke="#c58f91" d="m52 17 9 24m11-24-3 24" /><circle fill="#253335" cx="75" cy="57" r="3.5" /><path d="m88 63 4 2-4 3" />
  {:else if kind === "easternDragon"}
    <path stroke={species.color} stroke-width="17" d="M22 79C4 67 21 48 38 62s32 8 24-11-27-19-18-32c7-11 25-7 29 7" />
    <path stroke="#d4b576" stroke-width="4" d="M22 84c-12-12 3-26 16-13s37 5 27-16" />
    <path fill={species.color} d="m68 22 10-9 18 5 5 11 13 5-3 13-23 3-17-9-3-19Z" />
    <path stroke="#d4b576" stroke-width="4" d="m79 17-4-11-8-2m25 16 6-12 8-2M39 29l-9-4m7 13-11-2m13 13-12 2M52 60l10 13 12-1" />
    <path stroke="#d4b576" d="m101 43 10 11 5-1m-23-8 5 14 9 2" /><circle fill="#253335" cx="94" cy="28" r="3" />
  {:else}
    {#if kind === "griffin"}<path fill="#ead8b2" d="M50 52 20 13l25 13-4-15 18 14 5-11 13 31-27 7Z" />{/if}
    <path fill={species.color} d="M20 49c4-17 24-20 41-13l15 5 8 20-4 20H68l-3-18H43l-5 18H26l1-22-7-10Z" />
    {#if kind === "bear"}
      <circle fill={species.color} cx="73" cy="25" r="9" /><circle fill={species.color} cx="96" cy="29" r="8" />
      <path fill={species.color} d="M64 36c2-17 27-19 36-5s4 27-10 30L72 56l-8-20Z" /><path fill="#c09a6b" d="M82 44c4-8 17-7 21 0v9H85l-3-9Z" />
    {:else if kind === "griffin"}
      <path fill="#eadfc7" d="m69 49 2-25 11-8 17 6 1 24-14 14-17-11Z" /><path fill="#d5ad52" d="m98 29 17 9-10 12-8-7Z" /><path d="m77 28 8-6m-6 13 9-5" />
    {:else}
      <path fill={species.color} d="m64 39 7-21 10 8 14-7 5 23 12 8-5 12-25-1-18-22Z" />
      <path fill="#e8dec9" d="m85 47 23 3-3 9-19-2Z" /><path fill="#303735" d="m107 49 7 1-6 6Z" />
    {/if}
    <circle fill="#253335" cx="91" cy={kind === "bear" ? 37 : 36} r="3" />
    {#if kind !== "bear"}<path stroke={species.color} stroke-width={kind === "wolf" ? 10 : 5} d="M23 49C7 45 8 29 15 26" />{/if}
    {#if kind === "tiger"}<path stroke="#40392e" stroke-width="4" d="m35 37 3 14m9-16 4 17m8-15 4 15m12-24 5 12m-3 12 7 6M30 69h8m32 0h8" />{/if}
  {/if}
</svg>
