<script lang="ts">
  import { gaugePosition } from "$lib/lounge/fishing";
  import type { LoungeFishingProps } from "$lib/types/Lounge";

  let { action, now, getNow, disabled, onReel, onCancel }: LoungeFishingProps = $props();
  let track = $state<HTMLSpanElement | null>(null);
  let needle = $state<HTMLSpanElement | null>(null);
  const gauge = $derived(action.fishing!);
  const readyAt = $derived(gauge.readyAt ?? action.startedAt);
  const preparing = $derived(now < readyAt);

  $effect(() => {
    if (!track || !needle || disabled || preparing) return;
    const bar = track;
    const indicator = needle;
    const startedAt = readyAt;
    const endsAt = action.endsAt;
    let width = bar.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => { width = entry.contentRect.width; });
    observer.observe(bar);
    const draw = () => {
      const time = getNow();
      indicator.style.transform = `translate3d(${gaugePosition(startedAt, time) * width}px,0,0)`;
      if (time < endsAt) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  });
</script>

<section class="fishing-game" aria-label="낚시">
  <header><strong>{preparing ? "낚싯대를 던지고 있어요" : "입질이 왔어요"}</strong><span aria-live="off">{preparing ? "준비" : `${Math.max(0, Math.ceil((action.endsAt - now) / 1000))}초`}</span><button type="button" class="game-tool" aria-label="낚시 취소" disabled={disabled} onclick={onCancel}>×</button></header>
  <button type="button" class="fishing-reel" disabled={disabled || preparing}
    onpointerdown={(event) => { if (event.button === 0) { event.preventDefault(); onReel(); } }}
    onclick={(event) => { if (event.detail === 0) onReel(); }}
    aria-label="성공 구간에서 낚아채기. 좌클릭 또는 스페이스">
    <span class="fishing-track" bind:this={track} aria-hidden="true">
      <span class="fishing-zone" style={`left:${(gauge.center - gauge.width / 2) * 100}%;width:${gauge.width * 100}%`}><span>성공</span></span>
      <span class="fishing-needle" bind:this={needle}></span>
    </span>
    <span>{preparing ? "찌가 내려앉으면 시작해요" : disabled ? "낚아채는 중…" : "표시 구간에서 좌클릭"} <kbd>Space</kbd></span>
  </button>
</section>
