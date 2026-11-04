<script lang="ts">
  import characterModel from "$lib/assets/data/lounge/character-model.json";
  import { goto } from "$app/navigation";
  import { onMount, tick } from "svelte";
  import AvatarEditor from "$lib/components/Lounge/AvatarEditor.svelte";
  import AvatarPreview from "$lib/components/Lounge/AvatarPreview.svelte";
  import { joinLoungeChannel, loadLoungeChannels, loadLoungeProfile } from "$lib/client/lounge";
  import { loungeChannels, loungeRules } from "$lib/lounge/shared";
  import { normalizeAppearance } from "$lib/lounge/appearance";
  import type { LoungeAppearance } from "$lib/types/LoungeAppearance";
  import type { LoungeChannelSummary } from "$lib/types/Lounge";

  let nickname = $state("");
  let appearance = $state.raw<LoungeAppearance>(normalizeAppearance());
  let channelId = $state(loungeChannels[0].id);
  let channels = $state<LoungeChannelSummary[]>([]);
  let loading = $state(true);
  let joining = $state(false);
  let customizing = $state(false);
  let customizeButton = $state<HTMLButtonElement | null>(null);
  let error = $state("");
  let channelError = $state("");
  let mounted = false;
  let profileTouched = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let channelAbort: AbortController | null = null;
  const chosen = $derived(channels.find((channel) => channel.id === channelId));
  const full = $derived(chosen ? chosen.count >= chosen.capacity : false);
  async function openCustomizer() {
    customizing = true;
    await tick();
    document.querySelector<HTMLButtonElement>("#lounge-customizer button")?.focus({ preventScroll: true });
  }
  async function finishCustomizer() {
    customizing = false;
    await tick();
    customizeButton?.focus({ preventScroll: true });
  }
  function limitName(event: Event) {
    if (event instanceof InputEvent && event.isComposing) return;
    const input = event.currentTarget as HTMLInputElement;
    nickname = [...input.value.normalize("NFKC")].slice(0, loungeRules.nicknameMaxLength).join(""); input.value = nickname;
  }

  async function refreshChannels() {
    channelError = "";
    channelAbort?.abort();
    const controller = new AbortController();
    channelAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try { const result = await loadLoungeChannels(controller.signal); if (mounted && channelAbort === controller) channels = result; }
    catch { if (mounted && channelAbort === controller) channelError = "채널 현황을 가져오지 못했어요."; }
    finally {
      clearTimeout(timeout);
      if (mounted && channelAbort === controller) {
        loading = false;
        refreshTimer = setTimeout(() => { if (!document.hidden) void refreshChannels(); else refreshTimer = setTimeout(() => void refreshChannels(), 10000); }, 10000);
      }
    }
  }

  async function enter(event: SubmitEvent) {
    event.preventDefault();
    if (customizing) { await finishCustomizer(); return; }
    if (joining || !nickname.trim() || full) return;
    joining = true;
    error = "";
    try {
      await joinLoungeChannel({ channelId, nickname: nickname.trim(), color: appearance.topColor, appearance });
      await goto(`/lounge/${channelId}`);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "입장하지 못했어요. 다시 시도해 주세요.";
      joining = false;
      if (mounted) { if (refreshTimer) clearTimeout(refreshTimer); void refreshChannels(); }
    }
  }

  onMount(() => {
    mounted = true;
    void loadLoungeProfile().then((profile) => {
      if (!mounted || !profile || profileTouched) return;
      if (!nickname && typeof profile.nickname === "string") nickname = [...profile.nickname.normalize("NFKC")].slice(0, loungeRules.nicknameMaxLength).join("");
      appearance = normalizeAppearance(profile.appearance, profile.color);
      if (loungeChannels.some((channel) => channel.id === profile.channelId)) channelId = profile.channelId;
    });
    void refreshChannels();
    return () => { mounted = false; channelAbort?.abort(); if (refreshTimer) clearTimeout(refreshTimer); };
  });
</script>

<svelte:head><title>라운지 · 장난감 웹</title><meta name="description" content="캐릭터를 꾸미고 캠핑장에서 대화하세요." /></svelte:head>

<div class="lounge-entrance">
  <header class="lounge-page-heading"><h1>라운지</h1></header>
  <form class="entrance-layout" class:is-customizing={customizing} onsubmit={enter} oninput={() => profileTouched = true}>
    <section class="entrance-scene" aria-label="내 캐릭터 미리보기">
      <AvatarPreview {appearance} {nickname} />
      {#if !customizing}<button type="button" class="entrance-edit-button" bind:this={customizeButton} disabled={joining} onclick={() => void openCustomizer()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z" /></svg>꾸미기</button>{/if}
    </section>
    <div class="entrance-form">
      {#if customizing}
        <div id="lounge-customizer"><AvatarEditor value={appearance} disabled={joining} onChange={(value) => { profileTouched = true; appearance = value; }} /></div>
        <button type="button" class="lounge-button primary entrance-submit" onclick={() => void finishCustomizer()}>완료</button>
      {:else}
        <label class="lounge-field"><span class="nickname-label">닉네임 <small>{[...nickname].length} / {loungeRules.nicknameMaxLength}</small></span><input bind:value={nickname} oninput={limitName} oncompositionend={limitName} maxlength={loungeRules.nicknameMaxLength * 2} required autocomplete="nickname" placeholder="최대 6자" disabled={joining} /></label>
        <fieldset class="channel-field"><legend>캠핑장</legend><div class="channel-options">{#each loungeChannels as channel}{@const live = channels.find((item) => item.id === channel.id)}{@const channelFull = live ? live.count >= live.capacity : false}
          <label class:selected={channelId === channel.id} class:full={channelFull}><input type="radio" name="channel" value={channel.id} bind:group={channelId} disabled={joining || channelFull} /><span class="channel-name"><strong>캠핑장 {channel.id}</strong></span><span class="channel-radio" aria-hidden="true"></span><span class="channel-count">{channelFull ? "만석" : live ? `${live.count} / ${live.capacity}명` : loading ? "확인 중" : `— / ${channel.capacity}명`}</span></label>
        {/each}</div></fieldset>
        {#if channelError}<div class="channel-refresh"><span>현황을 불러오지 못했어요.</span><button type="button" onclick={() => { if (refreshTimer) clearTimeout(refreshTimer); void refreshChannels(); }} disabled={joining}>재시도</button></div>{/if}
        {#if error}<p class="lounge-error" role="alert">{error}</p>{/if}
        <button type="submit" class="lounge-button primary entrance-submit" disabled={joining || !nickname.trim() || full} aria-busy={joining}>{joining ? "입장 중…" : full ? "캠핑장을 선택하세요" : "입장"}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
      {/if}
    </div>
  </form>
  <a class="lounge-model-credit" href={characterModel.source} target="_blank" rel="noreferrer">캐릭터 원본 · {characterModel.creator}</a>
</div>
