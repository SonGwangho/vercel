<script lang="ts">
  import { tick, untrack } from "svelte";
  import { loungeRules } from "$lib/lounge/shared";
  import type { LoungeChatHistoryProps } from "$lib/types/Lounge";

  let { messages, selfId, open, onClose, onCompose, onUnread }: LoungeChatHistoryProps = $props();
  let list = $state<HTMLOListElement | null>(null);
  let newBelow = $state(0);
  let atBottom = true;
  let knownIds = new Set<string>();
  let initialized = false;
  let wasOpen = false;
  const unreadIds = new Set<string>();

  function latest() {
    if (list) list.scrollTop = list.scrollHeight;
    atBottom = true; newBelow = 0;
  }
  function scroll() {
    if (!list) return;
    atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    if (atBottom) newBelow = 0;
  }

  $effect(() => {
    const current = messages;
    const expanded = open;
    const added = initialized ? current.filter((message) => !knownIds.has(message.id)) : [];
    const justOpened = expanded && !wasOpen;
    knownIds = new Set(current.map((message) => message.id));
    initialized = true; wasOpen = expanded;
    if (expanded) unreadIds.clear();
    else for (const message of added) if (message.playerId !== selfId) unreadIds.add(message.id);
    for (const id of unreadIds) if (!knownIds.has(id)) unreadIds.delete(id);
    onUnread(unreadIds.size);
    if (expanded && (justOpened || atBottom)) {
      void tick().then(() => { if (open && list && (justOpened || atBottom)) latest(); });
    } else if (expanded && added.length) newBelow = untrack(() => newBelow) + added.length;
  });
</script>

{#if open}
  <section id="lounge-chat-history" class="game-history" aria-labelledby="lounge-history-title">
    <header><div><h2 id="lounge-history-title">채팅 기록</h2><span>최근 {loungeRules.chatHistoryLimit}개</span></div><button type="button" class="game-tool" aria-label="채팅 기록 닫기" onclick={onClose}>×</button></header>
    <ol bind:this={list} onscroll={scroll} tabindex="0" aria-label="이전 대화">
      {#each messages as message (message.id)}
        <li class:mine={message.playerId === selfId}>
          <div><strong>{message.nickname}</strong><time datetime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</time></div>
          <p>{message.text}</p>
        </li>
      {/each}
      {#if !messages.length}<li class="history-empty">아직 대화가 없어요.</li>{/if}
    </ol>
    <footer>{#if newBelow}<button type="button" class="history-latest" onclick={latest}>새 메시지 {newBelow}개 보기</button>{/if}<button type="button" class="lounge-button secondary" onclick={onCompose}>대화하기</button></footer>
  </section>
{/if}
