<script lang="ts">
  import type { LoungeAvatarProps } from "$lib/types/Lounge";
  let { color, walking = false, action = null, stunned = false, size = 64 }: LoungeAvatarProps = $props();
</script>

<svg class="avatar" class:walking class:stunned class:hugging={action === "hug"} class:punching={action === "punch"} class:greeting={action === "handshake" || action === "give"} class:eating={action === "eat"} width={size} height={size * 1.25} viewBox="0 0 72 90" fill="none" aria-hidden="true" style={`--avatar-color:${color};`}>
  <ellipse cx="36" cy="85" rx="19" ry="4" fill="currentColor" opacity="0.09" />
  <g class="person">
    <g class="leg left-leg"><path d="M25 65h10v17H24V69a4 4 0 0 1 1-4Z" fill="#39465A" /><rect x="20" y="78" width="16" height="7" rx="3" fill="#273347" /></g>
    <g class="leg right-leg"><path d="M38 65h10v17H37V69a4 4 0 0 1 1-4Z" fill="#39465A" /><rect x="37" y="78" width="16" height="7" rx="3" fill="#273347" /></g>
    <rect x="21" y="44" width="30" height="28" rx="11" fill={color} />
    <path d="M29 45c0 8 14 8 14 0" stroke="white" stroke-opacity="0.28" stroke-width="3" />
    <g class="arm left-arm"><rect x="14" y="48" width="11" height="20" rx="5.5" fill={color} /><circle cx="20" cy="67" r="5" fill="#F1CBA9" /></g>
    <g class="arm right-arm"><rect x="47" y="48" width="11" height="20" rx="5.5" fill={color} /><circle cx="52" cy="67" r="5" fill="#F1CBA9" /></g>
    <rect x="31" y="38" width="10" height="11" rx="4" fill="#E5B791" />
    <rect x="17" y="9" width="38" height="35" rx="17" fill="#F1CBA9" />
    <path d="M17 25V22c0-11 7-17 19-17s19 6 19 17v4l-7-8-5 5-7-7-8 7-6-3-5 5Z" fill="#394052" />
    {#if stunned}
      <path d="m26 28 5 5m0-5-5 5m15-5 5 5m0-5-5 5" stroke="#394052" stroke-width="2" stroke-linecap="round" />
    {:else}
      <circle cx="28" cy="30" r="2" fill="#394052" /><circle cx="44" cy="30" r="2" fill="#394052" />
    {/if}
    <path d="M32 37c2 2 6 2 8 0" stroke="#BB7E67" stroke-width="1.8" stroke-linecap="round" />
  </g>
  {#if stunned}<g class="dizzy" fill="#D9982F"><path d="m15 5 1.4 3.4L20 10l-3.6 1.4L15 15l-1.4-3.6L10 10l3.6-1.6L15 5Z" /><path d="m59 7 1 2.4 2.5 1.1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1.1L59 7Z" /></g>{/if}
</svg>

<style>
  .avatar { overflow: visible; color: var(--text, #263247); flex: 0 0 auto; }
  .person { transform-origin: 36px 82px; }
  .leg { transform-origin: 36px 65px; }
  .arm { transform-origin: 22px 49px; }
  .right-arm { transform-origin: 51px 49px; }
  .walking .person { animation: bob 0.42s ease-in-out infinite; }
  .walking .left-leg { animation: step 0.42s ease-in-out infinite alternate; }
  .walking .right-leg { animation: step 0.42s ease-in-out infinite alternate-reverse; }
  .hugging .left-arm { transform: rotate(-52deg); }
  .hugging .right-arm { transform: rotate(52deg); }
  .greeting .right-arm { animation: wave 0.35s ease-in-out infinite alternate; }
  .punching .right-arm { animation: punch 0.3s ease-out 2; }
  .eating .right-arm { transform: rotate(-125deg); }
  .stunned .person { transform: rotate(18deg) translate(5px, 0); }
  .dizzy { animation: dizzy 0.6s ease-in-out infinite alternate; }
  @keyframes bob { 50% { transform: translateY(-2px); } }
  @keyframes step { to { transform: translateY(-3px); } }
  @keyframes wave { to { transform: rotate(-75deg); } }
  @keyframes punch { 50% { transform: rotate(-100deg) translateX(6px); } }
  @keyframes dizzy { to { transform: translateY(-3px); opacity: 0.5; } }
  @media (prefers-reduced-motion: reduce) { .walking .person, .walking .leg, .greeting .right-arm, .punching .right-arm, .dizzy { animation: none; } }
</style>
