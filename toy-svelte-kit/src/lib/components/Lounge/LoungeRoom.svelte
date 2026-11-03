<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount, tick } from "svelte";
  import Avatar from "./Avatar.svelte";
  import FoodIcon from "./FoodIcon.svelte";
  import { fetchLoungeSnapshot, forgetLoungeSession, loadLoungeSession, LoungeClientError, postLoungeCommand, takeInitialLoungeSnapshot } from "$lib/client/lounge";
  import { actionNames, clampPosition, distance, foodName, interactionBlock, loungeRules, loungeWorld, positionAt } from "$lib/lounge/shared";
  import { nameLabels, speechBubbles } from "$lib/lounge/layout";
  import type { LoungeBubble, LoungeCommand, LoungeCommandInput, LoungeMenuTarget, LoungeMove, LoungeNameLabel, LoungePoint, LoungeRenderedPlayer, LoungeRoomClientState, LoungeRoomProps, LoungeSession, LoungeSnapshot } from "$lib/types/Lounge";

  let { channel }: LoungeRoomProps = $props();
  let session = $state.raw<LoungeSession | null>(null);
  let room = $state.raw<LoungeSnapshot | null>(null);
  let connection = $state<LoungeRoomClientState>("connecting");
  let players = $state.raw<LoungeRenderedPlayer[]>([]);
  let labels = $state.raw<LoungeNameLabel[]>([]);
  let bubbles = $state.raw<LoungeBubble[]>([]);
  let viewport = $state.raw<LoungePoint>({ x: 900, y: 520 });
  let camera = $state.raw<LoungePoint>({ x: 0, y: 0 });
  let now = $state(Date.now());
  let chatDraft = $state("");
  let sending = $state(false);
  let leaving = $state(false);
  let toast = $state("");
  let showHelp = $state(false);
  let mobileTab = $state<"chat" | "people" | "bag">("chat");
  let menu = $state<LoungeMenuTarget | null>(null);
  let stage = $state<HTMLDivElement | null>(null);
  let menuElement = $state<HTMLDivElement | null>(null);
  let chatInput = $state<HTMLInputElement | null>(null);
  let chatLog = $state<HTMLDivElement | null>(null);

  let mounted = false;
  let hasLeft = false;
  let clockOffset = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let pollAbort: AbortController | null = null;
  let commandAbort: AbortController | null = null;
  let queuedTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let frameId: number | null = null;
  let lastFrame = 0;
  let failures = 0;
  let optimisticMove: LoungeMove | null = null;
  let queuedMove: LoungePoint | null = null;
  let holdStart: LoungePoint | null = null;
  let suppressClick = false;
  let stickChat = true;

  const me = $derived(room?.players.find((player) => player.id === session?.playerId) ?? null);
  const stunned = $derived(Boolean(me && me.stunnedUntil > now));
  const myBlock = $derived(me ? interactionBlock(me, now) : "먼저 라운지에 연결해 주세요.");
  const incoming = $derived(room?.requests.find((request) => request.toId === session?.playerId && request.expiresAt > now) ?? null);
  const outgoing = $derived(room?.requests.find((request) => request.fromId === session?.playerId && request.expiresAt > now) ?? null);
  const requester = $derived(room?.players.find((player) => player.id === incoming?.fromId));
  const receiver = $derived(room?.players.find((player) => player.id === outgoing?.toId));
  const menuPlayer = $derived(menu?.kind === "player" ? room?.players.find((player) => player.id === menu.id) : null);
  const menuFood = $derived(menu?.kind === "food" ? room?.foods.find((food) => food.id === menu.id) : null);
  const selfMenu = $derived(menuPlayer?.id === session?.playerId);
  const offset = $derived({ x: Math.max(0, (viewport.x - loungeWorld.width) / 2), y: Math.max(0, (viewport.y - loungeWorld.height) / 2) });
  const currentAction = $derived(me?.action && me.action.endsAt > now ? me.action : null);
  const lastNotice = $derived(room?.notices.at(-1));
  const requestRemaining = $derived(Math.max(0, Math.ceil(((incoming ?? outgoing)?.expiresAt ?? now) / 1000 - now / 1000)));

  function inform(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = ""; }, 4000);
  }

  function applySnapshot(snapshot: LoungeSnapshot, sentAt: number) {
    if (!mounted || snapshot.channel.id !== channel.id || (room && snapshot.revision < room.revision)) return;
    clockOffset = snapshot.serverNow - (sentAt + Date.now()) / 2;
    room = snapshot;
    now = Date.now() + clockOffset;
    if (session && !snapshot.players.some((player) => player.id === session!.playerId)) expire();
  }

  function expire() {
    connection = "expired";
    if (pollTimer) clearTimeout(pollTimer);
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    if (session) void forgetLoungeSession(session);
    closeMenu();
  }

  function schedulePoll(delay = loungeRules.pollMs) {
    if (pollTimer) clearTimeout(pollTimer);
    if (mounted && !leaving && !document.hidden && connection !== "expired") pollTimer = setTimeout(() => void poll(), delay);
  }

  async function poll() {
    if (!mounted || !session || document.hidden || connection === "expired") return;
    pollAbort?.abort();
    const controller = new AbortController();
    pollAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    const sentAt = Date.now();
    try {
      const snapshot = await fetchLoungeSnapshot(session, controller.signal);
      if (!mounted || controller.signal.aborted || pollAbort !== controller) return;
      applySnapshot(snapshot, sentAt);
      if (snapshot.players.some((player) => player.id === session?.playerId)) connection = "connected";
      failures = 0;
    } catch (cause) {
      if (!mounted || document.hidden || leaving || pollAbort !== controller) return;
      if (cause instanceof LoungeClientError && cause.status === 401) expire();
      else { connection = "reconnecting"; failures += 1; }
    } finally {
      clearTimeout(timeout);
      if (pollAbort === controller) {
        pollAbort = null;
        schedulePoll(failures ? Math.min(5000, loungeRules.pollMs * 2 ** Math.min(failures, 3)) : loungeRules.pollMs);
      }
    }
  }

  async function send(input: LoungeCommandInput): Promise<boolean> {
    if (!session || connection !== "connected" || leaving) { inform("연결을 확인하고 있어요. 잠시만 기다려 주세요."); return false; }
    if (sending) {
      if (input.type === "move") queuedMove = { x: input.x, y: input.y };
      return false;
    }
    if (stunned && input.type !== "leave") { inform("기절이 풀릴 때까지 기다려 주세요."); return false; }
    sending = true;
    closeMenu();
    const command = { ...input, commandId: crypto.randomUUID() } as LoungeCommand;
    const sentAt = Date.now();
    if (input.type === "move" && me) {
      const from = positionAt(me, now);
      const to = clampPosition(input);
      optimisticMove = { from, to, startedAt: now, endsAt: now + distance(from, to) / loungeWorld.speed * 1000 };
    }
    commandAbort = new AbortController();
    const timeout = setTimeout(() => commandAbort?.abort(), 12000);
    try {
      const snapshot = await postLoungeCommand(session, command, false, commandAbort.signal);
      applySnapshot(snapshot, sentAt);
      return true;
    } catch (cause) {
      if (mounted) {
        if (cause instanceof LoungeClientError && cause.status === 401) expire();
        else inform(cause instanceof Error ? cause.message : "행동을 처리하지 못했어요. 다시 시도해 주세요.");
      }
      return false;
    } finally {
      clearTimeout(timeout);
      commandAbort = null;
      optimisticMove = null;
      sending = false;
      if (mounted && queuedMove) {
        const point = queuedMove;
        queuedMove = null;
        queuedTimer = setTimeout(() => { if (mounted) void moveTo(point); }, 120);
      }
    }
  }

  function moveTo(point: LoungePoint) {
    if (!me || stunned || currentAction) { if (myBlock) inform(myBlock); return Promise.resolve(false); }
    return send({ type: "move", ...clampPosition(point) });
  }

  function approach(point: LoungePoint) {
    if (!me) return;
    const from = positionAt(me, now);
    const length = distance(from, point) || 1;
    void moveTo({ x: point.x + (from.x - point.x) / length * 68, y: point.y + (from.y - point.y) / length * 68 });
  }

  async function chat(event: SubmitEvent) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || stunned || sending) return;
    if (await send({ type: "chat", text })) { if (chatDraft.trim() === text) chatDraft = ""; chatInput?.focus(); }
  }

  function screenPoint(clientX: number, clientY: number): LoungePoint | null {
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    return clampPosition({ x: clientX - rect.left + camera.x - offset.x, y: clientY - rect.top + camera.y - offset.y });
  }

  function clickWorld(event: MouseEvent) {
    if (suppressClick) { suppressClick = false; return; }
    if ((event.target as Element).closest("[data-no-move]")) return;
    closeMenu();
    const point = screenPoint(event.clientX, event.clientY);
    if (point) void moveTo(point);
  }

  async function openMenu(kind: "player" | "food", id: string, x: number, y: number) {
    if (connection !== "connected") return;
    menu = { kind, id, x: Math.max(12, Math.min(window.innerWidth - 264, x)), y: Math.max(12, Math.min(window.innerHeight - 320, y)) };
    await tick();
    if (menuElement && menu) {
      const rect = menuElement.getBoundingClientRect();
      menu = { ...menu, x: Math.max(12, Math.min(window.innerWidth - rect.width - 12, menu.x)), y: Math.max(12, Math.min(window.innerHeight - rect.height - 12, menu.y)) };
      (menuElement.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)") ?? menuElement.querySelector<HTMLButtonElement>("header button"))?.focus();
    }
  }

  function contextWorld(event: MouseEvent) {
    event.preventDefault();
    const element = (event.target as Element).closest<HTMLElement>("[data-lounge-kind]");
    if (!element?.dataset.loungeId) { closeMenu(); return; }
    void openMenu(element.dataset.loungeKind as "player" | "food", element.dataset.loungeId, event.clientX, event.clientY);
  }

  function closeMenu() { menu = null; }

  function longPressStart(event: PointerEvent) {
    if (event.pointerType !== "touch") return;
    cancelLongPress();
    const element = (event.target as Element).closest<HTMLElement>("[data-lounge-kind]");
    if (!element?.dataset.loungeId) return;
    holdStart = { x: event.clientX, y: event.clientY };
    holdTimer = setTimeout(() => {
      suppressClick = true;
      void openMenu(element.dataset.loungeKind as "player" | "food", element.dataset.loungeId!, event.clientX, event.clientY);
    }, 500);
  }

  function cancelLongPress() { if (holdTimer) clearTimeout(holdTimer); holdTimer = null; holdStart = null; }

  function worldKeys(event: KeyboardEvent) {
    if (event.key === "Escape") { closeMenu(); return; }
    if (event.key === "Enter" && !(event.target as Element).closest("button")) { event.preventDefault(); if (!stunned) chatInput?.focus(); return; }
    const target = (event.target as Element).closest<HTMLElement>("[data-lounge-kind]");
    if (target && ["Enter", " ", "ContextMenu"].includes(event.key)) {
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      void openMenu(target.dataset.loungeKind as "player" | "food", target.dataset.loungeId!, rect.right, rect.top);
      return;
    }
    if (me && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const point = positionAt(me, now);
      void moveTo({ x: point.x + (event.key === "ArrowLeft" ? -90 : event.key === "ArrowRight" ? 90 : 0), y: point.y + (event.key === "ArrowUp" ? -90 : event.key === "ArrowDown" ? 90 : 0) });
    }
  }

  function menuKeys(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); closeMenu(); stage?.focus(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !menuElement) return;
    event.preventDefault();
    const items = [...menuElement.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  function nearby(point: LoungePoint) { return me ? distance(positionAt(me, now), point) <= loungeRules.interactionRange : false; }
  function playerReason() {
    if (!me || !menuPlayer) return "상대를 찾을 수 없어요.";
    if (myBlock) return myBlock;
    const targetBlock = interactionBlock(menuPlayer, now);
    if (targetBlock) return "상대가 다른 행동을 마칠 때까지 기다려 주세요.";
    if (!nearby(positionAt(menuPlayer, now))) return "가까이 이동한 뒤 상호작용해 주세요.";
    return "";
  }

  function renderFrame(at: number) {
    frameId = null;
    if (!mounted || document.hidden || connection === "expired") return;
    const clock = Date.now() + clockOffset;
    const animated = Boolean(optimisticMove || room?.players.some((player) => player.move.endsAt > clock || player.stunnedUntil > clock || (player.action && player.action.endsAt > clock)));
    if (at - lastFrame >= (animated ? 1000 / 30 : 160)) {
      lastFrame = at;
      now = Date.now() + clockOffset;
      if (room && session) {
        const rendered = room.players.map((player) => {
          const move = player.id === session!.playerId && optimisticMove && player.stunnedUntil <= now && !(player.action && player.action.endsAt > now) ? optimisticMove : player.move;
          return { ...player, ...positionAt({ move }, now), walking: move.endsAt > now && move.startedAt < move.endsAt, stunned: player.stunnedUntil > now, busy: Boolean(player.pendingRequestId || (player.action && player.action.endsAt > now)) };
        });
        const self = rendered.find((player) => player.id === session!.playerId);
        const nextCamera = self ? { x: Math.max(0, Math.min(loungeWorld.width - viewport.x, self.x - viewport.x / 2)), y: Math.max(0, Math.min(loungeWorld.height - viewport.y, self.y - viewport.y / 2)) } : camera;
        if (nextCamera.x !== camera.x || nextCamera.y !== camera.y) camera = nextCamera;
        players = rendered;
        const nextLabels = nameLabels(rendered, session.playerId, nextCamera, viewport, offset);
        labels = nextLabels;
        bubbles = speechBubbles(room.messages, nextLabels, viewport, now);
      }
    }
    frameId = requestAnimationFrame(renderFrame);
  }

  async function exit() {
    if (leaving) return;
    leaving = true;
    hasLeft = true;
    pollAbort?.abort();
    if (pollTimer) clearTimeout(pollTimer);
    if (session) {
      try { await postLoungeCommand(session, { type: "leave", commandId: crypto.randomUUID() }, true, AbortSignal.timeout(2500)); } catch { /* A stale connection is removed by the server lease. */ }
      await forgetLoungeSession(session);
    }
    await goto("/lounge");
  }

  function visibilityChanged() {
    closeMenu();
    if (document.hidden) {
      pollAbort?.abort();
      if (pollTimer) clearTimeout(pollTimer);
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    } else {
      if (frameId === null) frameId = requestAnimationFrame(renderFrame);
      void poll();
    }
  }

  function outsideMenu(event: PointerEvent) {
    if (menu && !(event.target as Element).closest(".lounge-context-menu")) closeMenu();
  }

  $effect(() => {
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => { viewport = { x: entry.contentRect.width, y: entry.contentRect.height }; });
    observer.observe(stage);
    return () => observer.disconnect();
  });

  $effect(() => {
    const last = room?.messages.at(-1)?.id;
    const tab = mobileTab;
    if (last && chatLog && stickChat && tab === "chat") void tick().then(() => { if (chatLog) chatLog.scrollTop = chatLog.scrollHeight; });
  });

  onMount(() => {
    mounted = true;
    void (async () => {
      const loaded = await loadLoungeSession(channel.id);
      if (!mounted) return;
      if (!loaded) { connection = "expired"; return; }
      session = loaded;
      const initial = takeInitialLoungeSnapshot(channel.id);
      if (initial) { applySnapshot(initial, Date.now()); connection = "connected"; }
      await poll();
    })();
    frameId = requestAnimationFrame(renderFrame);
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pointerdown", outsideMenu);
    window.addEventListener("resize", closeMenu);
    return () => {
      mounted = false;
      pollAbort?.abort(); commandAbort?.abort();
      if (pollTimer) clearTimeout(pollTimer);
      if (queuedTimer) clearTimeout(queuedTimer);
      if (toastTimer) clearTimeout(toastTimer);
      if (frameId !== null) cancelAnimationFrame(frameId);
      cancelLongPress();
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pointerdown", outsideMenu);
      window.removeEventListener("resize", closeMenu);
      if (session && !hasLeft) {
        void postLoungeCommand(session, { type: "leave", commandId: crypto.randomUUID() }, true).catch(() => {});
        void forgetLoungeSession(session);
      }
    };
  });
</script>

<svelte:head><title>{channel.name} · 장난감 웹</title></svelte:head>

<section class="lounge-room">
  <header class="room-heading"><div><a class="room-breadcrumb" href="/lounge" onclick={(event) => { event.preventDefault(); void exit(); }}>라운지</a><h1>{channel.name}<span class="room-population">{room?.players.length ?? 0}<small> / {channel.capacity}명</small></span></h1></div><div class="room-header-actions"><span class="connection-state" class:offline={connection !== "connected"}><i></i>{connection === "connected" ? "함께하는 중" : connection === "reconnecting" ? "다시 연결 중" : connection === "expired" ? "입장 필요" : "연결 중"}</span><button type="button" class="lounge-button quiet" onclick={() => showHelp = !showHelp} aria-expanded={showHelp}>이용 방법</button><button type="button" class="lounge-button secondary" onclick={exit} disabled={leaving}>{leaving ? "나가는 중" : "나가기"}</button></div></header>
  {#if showHelp}<div class="room-help"><p><strong>이동</strong> 바닥을 좌클릭하세요. 작은 지도에서도 목적지를 고를 수 있어요.</p><p><strong>상호작용</strong> 사람이나 음식을 우클릭하세요. 터치 화면에서는 길게 누르세요.</p><p><strong>동의와 기절</strong> 악수·포옹·음식 선물은 상대가 수락해야 해요. 펀치에 맞으면 {loungeRules.stunMs / 1000}초 동안 행동할 수 없어요.</p><p><strong>키보드</strong> 공간에서 방향키로 이동하고 Enter로 채팅하세요. 캐릭터에 초점을 맞춘 뒤 Enter를 누르면 행동 메뉴가 열려요.</p></div>{/if}
  {#if connection === "expired"}
    <div class="lounge-empty"><Avatar color={me?.color ?? "#4778d8"} size={88} /><h2>다시 만나러 갈까요?</h2><p>닉네임과 채널을 선택해 입장해 주세요.<br />오랫동안 자리를 비우면 입장이 종료돼요.</p><a class="lounge-button primary" href="/lounge">입장 화면으로</a></div>
  {:else if !room || !me}
    <div class="lounge-empty"><div class="lounge-loading-scene" aria-hidden="true"></div><h2>{connection === "reconnecting" ? "연결을 기다리고 있어요" : "라운지 문을 여는 중이에요"}</h2><p>잠시만 기다려 주세요.</p>{#if connection === "reconnecting"}<button class="lounge-button secondary" type="button" onclick={() => void poll()}>다시 연결</button>{/if}</div>
  {:else}
    <div class="room-layout">
      <div class="room-main">
        <div class="world-viewport" bind:this={stage} role="application" tabindex="0" aria-label="라운지 공간. 좌클릭 이동, 우클릭 상호작용. 방향키와 Enter로도 조작할 수 있습니다." onclick={clickWorld} oncontextmenu={contextWorld} onkeydown={worldKeys} onpointerdown={longPressStart} onpointerup={cancelLongPress} onpointercancel={cancelLongPress} onpointermove={(event) => { if (holdStart && Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) > 8) cancelLongPress(); }}>
          <div class="lounge-world" style={`width:${loungeWorld.width}px;height:${loungeWorld.height}px;transform:translate(${offset.x - camera.x}px,${offset.y - camera.y}px);`}>
            <div class="world-back-wall" aria-hidden="true"><div class="world-window"></div><div class="world-window"></div><span>{channel.name}</span></div><div class="world-rug" aria-hidden="true"></div><div class="world-seat seat-left" aria-hidden="true"></div><div class="world-seat seat-right" aria-hidden="true"></div><div class="world-plant plant-left" aria-hidden="true"><i></i><i></i><i></i></div><div class="world-plant plant-right" aria-hidden="true"><i></i><i></i><i></i></div>
            {#each room.foods as food (food.id)}<button type="button" class="ground-food" style={`transform:translate(${food.x}px,${food.y}px);z-index:${Math.round(food.y)};`} data-lounge-kind="food" data-lounge-id={food.id} aria-label={`${foodName(food.kind)}. 우클릭하거나 Enter로 줍기 메뉴 열기`}><FoodIcon kind={food.kind} size={35} /><span>{foodName(food.kind)}</span></button>{/each}
            {#each players as player (player.id)}<button type="button" class="world-player" class:self={player.id === session?.playerId} class:stunned={player.stunned} style={`transform:translate(${player.x}px,${player.y}px);z-index:${Math.round(player.y)};`} data-lounge-kind="player" data-lounge-id={player.id} aria-label={`${player.nickname}${player.id === session?.playerId ? ", 나" : ""}. 우클릭하거나 Enter로 행동 메뉴 열기`}><span class="player-body"><Avatar color={player.color} walking={player.walking} action={player.action && player.action.endsAt > now ? player.action.kind : null} stunned={player.stunned} size={58} /></span>{#if player.action?.foodKind && player.action.endsAt > now}<span class="held-food"><FoodIcon kind={player.action.foodKind} size={24} /></span>{/if}{#if player.stunned}<span class="player-state stunned-state">{Math.max(0, (player.stunnedUntil - now) / 1000).toFixed(1)}초</span>{:else if player.action && player.action.endsAt > now}<span class="player-state">{actionNames[player.action.kind]}</span>{:else if player.pendingRequestId}<span class="player-state">응답 대기</span>{/if}</button>{/each}
          </div>
          <svg class="speech-connectors" width="100%" height="100%" aria-hidden="true">{#each labels as label (label.playerId)}{#if label.anchorY - label.y > 33}<line x1={label.x + label.width / 2} y1={label.y + label.height} x2={label.anchorX} y2={label.anchorY} />{/if}{/each}{#each bubbles as bubble (bubble.id)}<line x1={Math.min(bubble.x + bubble.width - 12, Math.max(bubble.x + 12, bubble.anchorX))} y1={bubble.y + bubble.height} x2={bubble.anchorX} y2={bubble.anchorY} />{/each}</svg>
          <div class="world-labels" aria-hidden="true">{#each labels as label (label.playerId)}<div class="player-name" class:mine={label.self} style={`transform:translate(${label.x}px,${label.y}px);width:${label.width}px;--name-color:${label.color};`} data-lounge-kind="player" data-lounge-id={label.playerId} title={label.nickname}><span>{label.nickname}</span>{#if label.self}<small>나</small>{/if}</div>{/each}</div>
          <div class="world-bubbles" aria-hidden="true">{#each bubbles as bubble (bubble.id)}<div class="speech-bubble" style={`transform:translate(${bubble.x}px,${bubble.y}px);width:${bubble.width}px;height:${bubble.height}px;`}><strong>{bubble.nickname}</strong><p title={bubble.text}>{bubble.text}</p></div>{/each}</div>
          <div class="world-top-hint" data-no-move>좌클릭 이동 <span>·</span> 우클릭 행동</div>
          <button type="button" class="world-minimap" data-no-move aria-label="작은 지도. 클릭해서 이동할 위치 고르기" onclick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); void moveTo({ x: ((event.clientX - rect.left) / rect.width) * loungeWorld.width, y: ((event.clientY - rect.top) / rect.height) * loungeWorld.height }); }}><span class="minimap-frame" style={`left:${(camera.x / loungeWorld.width) * 100}%;top:${(camera.y / loungeWorld.height) * 100}%;width:${Math.min(100,(viewport.x / loungeWorld.width) * 100)}%;height:${Math.min(100,(viewport.y / loungeWorld.height) * 100)}%;`}></span>{#each players as player (player.id)}<i class:mine={player.id === session?.playerId} style={`left:${player.x / loungeWorld.width * 100}%;top:${player.y / loungeWorld.height * 100}%;background:${player.color};`}></i>{/each}</button>
        {#if incoming || outgoing}<div class="consent-panel" data-no-move role="region" aria-label="상호작용 동의 요청" aria-live="polite"><div><strong>{incoming ? `${requester?.nickname ?? "상대"} 님의 ${incoming.kind === "give" ? `${foodName(incoming.foodKind ?? "")} 선물` : actionNames[incoming.kind]} 요청` : `${receiver?.nickname ?? "상대"} 님의 응답을 기다리는 중`}</strong><p>{incoming ? "원할 때만 수락해 주세요." : "응답을 기다리는 동안 다른 상호작용은 잠시 쉬어요."} <span aria-live="off">{requestRemaining}초 남음</span></p></div><div class="consent-actions">{#if incoming}<button type="button" class="lounge-button secondary" disabled={sending || stunned} onclick={() => void send({ type: "respond", requestId: incoming!.id, accept: false })}>거절</button><button type="button" class="lounge-button primary" disabled={sending || stunned} onclick={() => void send({ type: "respond", requestId: incoming!.id, accept: true })}>수락</button>{:else if outgoing}<button type="button" class="lounge-button secondary" disabled={sending || stunned} onclick={() => void send({ type: "cancel", requestId: outgoing!.id })}>요청 취소</button>{/if}</div></div>{/if}
          {#if stunned}<div class="stun-banner" role="status">잠깐 기절했어요 <strong aria-hidden="true">{Math.max(0, (me.stunnedUntil - now) / 1000).toFixed(1)}초</strong></div>{/if}
          {#if toast}<div class="world-toast" role="status" data-no-move>{toast}</div>{/if}
          {#if connection === "reconnecting"}<div class="reconnect-banner" role="status">연결이 잠시 끊겼어요. 다시 연결하고 있습니다.</div>{/if}
        </div>
        <div class="room-notice" aria-live="polite">{#if lastNotice && now - lastNotice.createdAt < 8000}{lastNotice.text}{:else}<span class="notice-dot"></span>바닥의 음식은 주워 먹거나 다른 사람에게 건넬 수 있어요.{/if}</div>

        <form class="room-chat-form" onsubmit={chat}><label class="sr-only" for="lounge-chat">같은 채널에 보낼 말</label><span class="chat-nickname">{me.nickname}</span><input id="lounge-chat" bind:this={chatInput} bind:value={chatDraft} maxlength={loungeRules.chatMaxLength} autocomplete="off" placeholder={stunned ? "기절이 풀리면 이야기할 수 있어요" : "가볍게 한마디 건네 보세요…"} disabled={stunned || connection !== "connected"} /><button type="submit" class="lounge-button primary" disabled={!chatDraft.trim() || sending || stunned || connection !== "connected"}>보내기</button></form>
      </div>
      <aside class="room-sidebar">
        <div class="room-sidebar-tabs" role="tablist" aria-label="라운지 정보"><button type="button" role="tab" aria-selected={mobileTab === "chat"} onclick={() => mobileTab = "chat"}>대화</button><button type="button" role="tab" aria-selected={mobileTab === "people"} onclick={() => mobileTab = "people"}>참여자 {room.players.length}</button><button type="button" role="tab" aria-selected={mobileTab === "bag"} onclick={() => mobileTab = "bag"}>내 음식 {me.inventory.length}</button></div>
        <section class="room-chat-log" class:tab-visible={mobileTab === "chat"}><header><h2>나눈 이야기</h2><span>같은 채널의 대화</span></header><div class="chat-log-entries" bind:this={chatLog} role="log" aria-label="채널 대화 기록" aria-live="polite" aria-relevant="additions" onscroll={() => { if (chatLog) stickChat = chatLog.scrollHeight - chatLog.scrollTop - chatLog.clientHeight < 50; }}>{#if !room.messages.length}<div class="chat-empty"><p>아직 조용하네요.</p><span>먼저 반가운 인사를 건네 볼까요?</span></div>{/if}{#each room.messages as message (message.id)}<article class:my-message={message.playerId === session?.playerId}><div><strong>{message.nickname}</strong><time datetime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</time></div><p>{message.text}</p></article>{/each}</div></section>
        <section class="room-people" class:tab-visible={mobileTab === "people"}><header><h2>함께 있는 사람</h2><span>{room.players.length}명</span></header><ul>{#each room.players as person (person.id)}<li><button type="button" onclick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); void openMenu("player", person.id, rect.left - 260, rect.top); }}><span class="person-color" style={`background:${person.color};`}></span><span>{person.nickname}{#if person.id === session?.playerId}<small>나</small>{/if}</span><span class="person-status">{person.stunnedUntil > now ? "기절" : person.action && person.action.endsAt > now ? actionNames[person.action.kind] : person.pendingRequestId ? "대기" : ""}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button></li>{/each}</ul></section>
        <section class="room-bag" class:tab-visible={mobileTab === "bag"}><header><h2>내 음식</h2><span>{me.inventory.length} / {loungeRules.inventoryCapacity}</span></header>{#if !me.inventory.length}<p class="bag-empty">바닥의 음식을 우클릭해 주워 보세요.</p>{:else}<ul>{#each me.inventory as food (food.id)}<li><FoodIcon kind={food.kind} size={28} /><span>{foodName(food.kind)}</span></li>{/each}</ul><button type="button" class="bag-menu-button" onclick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); void openMenu("player", session!.playerId, rect.left - 260, rect.top); }}>내 캐릭터 행동 열기</button>{/if}</section>
      </aside>
    </div>
  {/if}
</section>

{#if menu && room && me}
  <div class="lounge-context-menu" bind:this={menuElement} role="menu" tabindex="-1" aria-label={menuPlayer ? `${menuPlayer.nickname} 행동 메뉴` : "음식 행동 메뉴"} style={`left:${menu.x}px;top:${menu.y}px;`} onkeydown={menuKeys}>
    <header><div><strong>{menuPlayer ? menuPlayer.nickname : menuFood ? foodName(menuFood.kind) : "대상이 사라졌어요"}</strong><span>{selfMenu ? "내 캐릭터" : menu?.kind === "food" ? "바닥의 음식" : "상호작용"}</span></div><button type="button" aria-label="행동 메뉴 닫기" onclick={closeMenu}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button></header>
    {#if menuFood}<button type="button" role="menuitem" disabled={sending || Boolean(myBlock) || !nearby(menuFood) || me.inventory.length >= loungeRules.inventoryCapacity} onclick={() => void send({ type: "pickup", foodId: menuFood!.id })}><FoodIcon kind={menuFood.kind} size={26} /><span>줍기</span></button>{#if myBlock}<p class="context-hint">{myBlock}</p>{:else if !nearby(menuFood)}<p class="context-hint">가까이 이동한 뒤 주울 수 있어요.</p><button type="button" role="menuitem" onclick={() => { if (menuFood) approach(menuFood); }}>음식 쪽으로 이동</button>{:else if me.inventory.length >= loungeRules.inventoryCapacity}<p class="context-hint">음식은 {loungeRules.inventoryCapacity}개까지 들 수 있어요.</p>{/if}
    {:else if menuPlayer && selfMenu}<p class="context-section-label">가지고 있는 음식</p>{#if !me.inventory.length}<p class="context-hint">아직 음식이 없어요. 바닥에서 주워 보세요.</p>{/if}{#each me.inventory as food (food.id)}<button type="button" role="menuitem" disabled={sending || Boolean(myBlock)} onclick={() => void send({ type: "eat", foodId: food.id })}><FoodIcon kind={food.kind} size={26} /><span>{foodName(food.kind)} 먹기</span></button>{/each}{#if myBlock}<p class="context-hint">{myBlock}</p>{/if}
    {:else if menuPlayer}{@const reason = playerReason()}<button type="button" role="menuitem" disabled={sending || Boolean(reason)} onclick={() => void send({ type: "interact", kind: "handshake", targetId: menuPlayer!.id })}><span>악수하기</span><small>상대 동의</small></button><button type="button" role="menuitem" disabled={sending || Boolean(reason)} onclick={() => void send({ type: "interact", kind: "hug", targetId: menuPlayer!.id })}><span>포옹하기</span><small>상대 동의</small></button>{#if me.inventory.length}<p class="context-section-label">음식 건네기 · 상대 동의</p>{#each me.inventory as food (food.id)}<button type="button" role="menuitem" disabled={sending || Boolean(reason) || menuPlayer.inventory.length >= loungeRules.inventoryCapacity} onclick={() => void send({ type: "interact", kind: "give", targetId: menuPlayer!.id, foodId: food.id })}><FoodIcon kind={food.kind} size={24} /><span>{foodName(food.kind)} 건네기</span></button>{/each}{/if}<button type="button" role="menuitem" class="punch-menu-item" disabled={sending || Boolean(reason)} onclick={() => void send({ type: "interact", kind: "punch", targetId: menuPlayer!.id })}><span>펀치하기</span><small>즉시 실행</small></button>{#if reason}<p class="context-hint">{reason}</p>{#if !nearby(positionAt(menuPlayer, now)) && !myBlock}<button type="button" role="menuitem" onclick={() => { if (menuPlayer) approach(positionAt(menuPlayer, now)); }}>가까이 이동</button>{/if}{/if}
    {:else}<p class="context-hint">다른 사람이나 음식을 선택해 주세요.</p>{/if}
  </div>
{/if}
