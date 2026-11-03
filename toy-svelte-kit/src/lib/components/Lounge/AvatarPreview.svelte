<script lang="ts">
  import { onMount } from "svelte";
  import { avatarOptions } from "$lib/lounge/appearance";
  import { loungeChannels, loungeWorld } from "$lib/lounge/shared";
  import type { LoungeAvatarPreviewProps } from "$lib/types/LoungeAppearance";
  import type { LoungeSceneController } from "$lib/types/LoungeScene";
  let { appearance, nickname }: LoungeAvatarPreviewProps = $props();
  let host = $state<HTMLDivElement | null>(null);
  let ready = $state(false);
  let error = $state("");
  let engine: LoungeSceneController | null = null;
  let revision = 0;
  const summary = $derived([
    avatarOptions.hairStyles.find((item) => item.id === appearance.hairStyle)?.name,
    avatarOptions.topStyles.find((item) => item.id === appearance.topStyle)?.name,
    avatarOptions.bottomStyles.find((item) => item.id === appearance.bottomStyle)?.name
  ].join(" · "));

  $effect(() => {
    const selected = appearance;
    const name = nickname;
    if (!ready || !engine) return;
    const point = { x: loungeWorld.width / 2, y: loungeWorld.height / 2 };
    engine.update({
      channel: loungeChannels[0], revision: ++revision, serverNow: Date.now(), foods: [], requests: [], messages: [], notices: [],
      players: [{ id: "preview", nickname: name || "내 캐릭터", color: selected.topColor, appearance: selected,
        move: { from: point, to: point, startedAt: 0, endsAt: 0 }, inventory: [], action: null, pendingRequestId: null, stunnedUntil: 0, joinedAt: 0 }]
    });
  });

  onMount(() => {
    let active = true;
    let observer: IntersectionObserver | null = null;
    void import("$lib/lounge/scene").then(({ LoungeScene }) => {
      if (!active || !host) return;
      engine = new LoungeScene(host, { selfId: "preview", preview: true, getNow: Date.now, onMove: () => {}, onContext: () => {}, onHover: () => {}, onError: (message) => { error = message; } });
      engine.setMuted(true); ready = true;
      observer = new IntersectionObserver(([entry]) => engine?.setVisible(entry.isIntersecting)); observer.observe(host);
    }).catch(() => { if (active) error = "3D 미리보기를 열지 못했어요. 그래픽 가속 설정을 확인해 주세요."; });
    return () => { active = false; observer?.disconnect(); engine?.dispose(); engine = null; };
  });
</script>

<div class="avatar-preview">
  <div class="avatar-preview-canvas" bind:this={host} aria-hidden="true"></div>
  <div class="avatar-preview-name"><span>반가워요!</span><strong>{nickname.trim() || "당신의 닉네임"}</strong></div>
  {#if error}<p class="avatar-preview-error" role="status">{error}</p>{:else if !ready}<p class="avatar-preview-loading" role="status">내 모습을 불러오는 중…</p>{/if}
  <div class="avatar-preview-footer"><div class="avatar-turn-controls"><button type="button" disabled={!ready || Boolean(error)} aria-label="캐릭터 왼쪽으로 돌리기" onclick={() => engine?.rotate(Math.PI / 4)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12" /></svg></button><span>돌려보기</span><button type="button" disabled={!ready || Boolean(error)} aria-label="캐릭터 오른쪽으로 돌리기" onclick={() => engine?.rotate(-Math.PI / 4)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m16 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" /></svg></button></div><p>{summary}</p></div>
</div>
