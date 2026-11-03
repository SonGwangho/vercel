<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import Avatar from "$lib/components/Lounge/Avatar.svelte";
  import { joinLoungeChannel, loadLoungeChannels, loadLoungeProfile } from "$lib/client/lounge";
  import { loungeChannels, loungeColors } from "$lib/lounge/shared";
  import type { LoungeChannelSummary } from "$lib/types/Lounge";

  let nickname = $state("");
  let color = $state(loungeColors[0]);
  let channelId = $state(loungeChannels[0].id);
  let channels = $state<LoungeChannelSummary[]>([]);
  let loading = $state(true);
  let joining = $state(false);
  let error = $state("");
  let channelError = $state("");
  let mounted = false;
  let profileTouched = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let channelAbort: AbortController | null = null;
  const chosen = $derived(channels.find((channel) => channel.id === channelId));
  const full = $derived(chosen ? chosen.count >= chosen.capacity : false);

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
    if (joining || !nickname.trim() || full) return;
    joining = true;
    error = "";
    try {
      await joinLoungeChannel({ channelId, nickname: nickname.trim(), color });
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
      if (!nickname && typeof profile.nickname === "string") nickname = profile.nickname;
      if (loungeColors.includes(profile.color)) color = profile.color;
      if (loungeChannels.some((channel) => channel.id === profile.channelId)) channelId = profile.channelId;
    });
    void refreshChannels();
    return () => { mounted = false; channelAbort?.abort(); if (refreshTimer) clearTimeout(refreshTimer); };
  });
</script>

<svelte:head><title>라운지 · 장난감 웹</title><meta name="description" content="닉네임 하나로 만나는 작은 라운지. 같은 공간에서 걷고 이야기하며 쉬어가세요." /></svelte:head>

<div class="lounge-entrance">
  <header class="lounge-page-heading"><h1>같이 쉬어가는 라운지</h1><p>이름 하나면 충분해요. 잠깐 머물다 가세요.</p></header>
  <div class="entrance-layout">
    <section class="entrance-scene" aria-label="내 캐릭터 미리보기">
      <div class="scene-window" aria-hidden="true"><span></span><span></span></div>
      <div class="scene-bench" aria-hidden="true"><i></i><i></i></div>
      <div class="scene-planter" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="preview-character"><span class="preview-bubble">반가워요!</span><strong class="preview-name">{nickname.trim() || "당신의 닉네임"}</strong><Avatar {color} size={116} /></div>
      <div class="scene-caption"><h2>작은 캐릭터, 새로운 만남</h2><p>다가가 인사하고, 음식을 나누고,<br />같은 공간에서 이야기를 나눠요.</p></div>
    </section>
    <form class="entrance-form" onsubmit={enter} oninput={() => profileTouched = true}>
      <div class="entrance-form-heading"><h2>어떤 이름으로 만날까요?</h2><p>머리 위에 표시될 이름을 정해 주세요.</p></div>
      <label class="lounge-field"><span>닉네임</span><input bind:value={nickname} maxlength="12" required autocomplete="nickname" placeholder="1~12자로 입력해 주세요" disabled={joining} aria-describedby="nickname-help" /><small id="nickname-help">같은 채널에서 이름이 겹치면 다른 이름을 골라 주세요.</small></label>
      <fieldset class="color-field"><legend>캐릭터 색상</legend><div class="color-options">{#each loungeColors as option, index}<label style={`--swatch:${option};`} class:chosen={color === option}><input type="radio" name="avatar-color" value={option} bind:group={color} disabled={joining} aria-label={`${["파랑", "분홍", "초록", "주황", "보라", "청록"][index]} 캐릭터`} /><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 12 4 4 8-8" /></svg></span></label>{/each}</div></fieldset>
      <fieldset class="channel-field"><legend>입장할 채널</legend><div class="channel-options">{#each loungeChannels as channel}{@const live = channels.find((item) => item.id === channel.id)}{@const channelFull = live ? live.count >= live.capacity : false}<label class:selected={channelId === channel.id} class:full={channelFull}><input type="radio" name="channel" value={channel.id} bind:group={channelId} disabled={joining || channelFull} /><span class="channel-radio" aria-hidden="true"></span><span class="channel-name"><strong>{channel.name}</strong><small>{channel.description}</small></span><span class="channel-count">{channelFull ? "가득 참" : live ? `${live.count} / ${live.capacity}명` : loading ? "확인 중" : "현황 확인 필요"}</span></label>{/each}</div></fieldset>
      {#if channelError}<div class="channel-refresh"><span>{channelError}</span><button type="button" onclick={() => { if (refreshTimer) clearTimeout(refreshTimer); void refreshChannels(); }} disabled={joining}>다시 확인</button></div>{/if}
      {#if error}<p class="lounge-error" role="alert">{error}</p>{/if}
      <button type="submit" class="lounge-button primary entrance-submit" disabled={joining || !nickname.trim() || full} aria-busy={joining}><span>{joining ? "문을 여는 중…" : full ? "다른 채널을 골라 주세요" : `${loungeChannels.find((channel) => channel.id === channelId)?.name ?? "라운지"} 입장하기`}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></button>
    </form>
  </div>
  <footer class="entrance-help"><span><strong>좌클릭</strong> 가고 싶은 곳으로 이동</span><span><strong>우클릭</strong> 캐릭터·음식과 상호작용</span><span><strong>채팅</strong> 말풍선으로 전하는 한마디</span></footer>
</div>
