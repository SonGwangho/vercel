<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount, tick } from "svelte";
  import FoodIcon from "./FoodIcon.svelte";
  import { fetchLoungeSnapshot, forgetLoungeSession, loadLoungeSession, LoungeClientError, postLoungeCommand, takeInitialLoungeSnapshot } from "$lib/client/lounge";
  import { actionNames, clampPosition, distance, foodName, interactionBlock, loungeRules, positionAt } from "$lib/lounge/shared";
  import { Storage } from "$lib/utils/Storage";
  import type { LoungeApproach, LoungeCommand, LoungeCommandInput, LoungeMenuTarget, LoungePoint, LoungeRoomClientState, LoungeRoomProps, LoungeSession, LoungeSnapshot } from "$lib/types/Lounge";
  import type { LoungeSceneController } from "$lib/types/LoungeScene";

  let { channel }: LoungeRoomProps = $props();
  let session = $state.raw<LoungeSession | null>(null);
  let room = $state.raw<LoungeSnapshot | null>(null);
  let connection = $state<LoungeRoomClientState>("connecting");
  let now = $state(Date.now());
  let ready = $state(false);
  let sceneError = $state("");
  let sending = $state(false);
  let chatting = $state(false);
  let leaving = $state(false);
  let muted = $state(false);
  let chatOpen = $state(false);
  let chatDraft = $state("");
  let showHelp = $state(false);
  let toast = $state("");
  let hover = $state("");
  let menu = $state<LoungeMenuTarget | null>(null);
  let plan = $state.raw<LoungeApproach | null>(null);
  let host = $state<HTMLDivElement | null>(null);
  let menuElement = $state<HTMLDivElement | null>(null);
  let chatInput = $state<HTMLInputElement | null>(null);

  let engine: LoungeSceneController | null = null;
  let mounted = false;
  let hasLeft = false;
  let clockOffset = 0;
  let clockReady = false;
  let bestRtt = Infinity;
  let failures = 0;
  let moveVersion = 0;
  let moving = false;
  let queuedMove: LoungePoint | null = null;
  let lastMoveAt = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let pollAbort: AbortController | null = null;
  const commands = new Set<AbortController>();

  const me = $derived(room?.players.find((player) => player.id === session?.playerId) ?? null);
  const stunned = $derived(Boolean(me && me.stunnedUntil > now));
  const currentAction = $derived(me?.action && me.action.endsAt > now ? me.action : null);
  const block = $derived(me ? interactionBlock(me, now) : "라운지에 연결하고 있어요.");
  const incoming = $derived(room?.requests.find((request) => request.toId === session?.playerId && request.expiresAt > now) ?? null);
  const outgoing = $derived(room?.requests.find((request) => request.fromId === session?.playerId && request.expiresAt > now) ?? null);
  const requester = $derived(room?.players.find((player) => player.id === incoming?.fromId));
  const receiver = $derived(room?.players.find((player) => player.id === outgoing?.toId));
  const menuPlayer = $derived(menu?.kind === "player" ? room?.players.find((player) => player.id === menu.id) : null);
  const menuFood = $derived(menu?.kind === "food" ? room?.foods.find((food) => food.id === menu.id) : null);
  const selfMenu = $derived(menuPlayer?.id === session?.playerId);
  const lastNotice = $derived(room?.notices.at(-1));
  const requestSeconds = $derived(Math.max(0, Math.ceil(((incoming ?? outgoing)?.expiresAt ?? now) / 1000 - now / 1000)));
  const usable = $derived(ready && connection === "connected" && !sceneError && !leaving);
  const targetBlock = $derived(block || (menuPlayer && !selfMenu ? interactionBlock(menuPlayer, now) ? "상대가 다른 행동을 하고 있어요." : "" : ""));

  function inform(message: string) {
    toast = message;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast = ""; }, 3300);
  }

  function syncClock(serverNow: number, sentAt: number, processingMs = 0) {
    const elapsed = Date.now() - sentAt;
    const processing = Math.min(elapsed, Math.max(0, processingMs));
    const rtt = elapsed - processing;
    const sample = serverNow - (sentAt + Date.now() + processing) / 2;
    if (!clockReady) { clockOffset = sample; clockReady = true; }
    else if (rtt <= bestRtt * 1.25 + 25) clockOffset += (sample - clockOffset) * 0.08;
    bestRtt = Math.min(bestRtt, rtt);
    now = Date.now() + clockOffset;
  }

  function applySnapshot(snapshot: LoungeSnapshot, sentAt: number) {
    if (!mounted || connection === "expired" || snapshot.channel.id !== channel.id || (room && snapshot.revision < room.revision)) return;
    syncClock(snapshot.serverNow, sentAt, snapshot.processingMs);
    if (room?.revision !== snapshot.revision) { room = snapshot; engine?.update(snapshot); }
    if (session && !snapshot.players.some((player) => player.id === session!.playerId)) expire();
  }

  function expire() {
    connection = "expired";
    if (pollTimer) clearTimeout(pollTimer);
    queuedMove = null; plan = null; menu = null;
    engine?.rejectMove();
    if (session) void forgetLoungeSession(session);
  }

  function schedulePoll(delay = loungeRules.pollMs) {
    if (pollTimer) clearTimeout(pollTimer);
    if (mounted && !document.hidden && connection !== "expired" && !leaving) pollTimer = setTimeout(() => void poll(), delay);
  }

  function sessionExpired() { return connection === "expired"; }

  async function poll() {
    if (!session || !mounted || document.hidden || pollAbort || leaving || sessionExpired()) return;
    const controller = new AbortController(); pollAbort = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    const sentAt = Date.now();
    try {
      const snapshot = await fetchLoungeSnapshot(session, controller.signal, room?.revision);
      if (!mounted || leaving || sessionExpired()) return;
      if ("unchanged" in snapshot) syncClock(snapshot.serverNow, sentAt, snapshot.processingMs);
      else applySnapshot(snapshot, sentAt);
      if (!sessionExpired()) connection = "connected";
      failures = 0;
    } catch (error) {
      if (!mounted || leaving || document.hidden) return;
      if (error instanceof LoungeClientError && error.status === 401) expire();
      else { connection = "reconnecting"; failures += 1; queuedMove = null; plan = null; engine?.rejectMove(); }
    } finally {
      clearTimeout(timeout); pollAbort = null;
      schedulePoll(failures ? Math.min(4000, 250 * 2 ** Math.min(failures, 4)) : 0);
    }
  }

  async function request(input: LoungeCommandInput, id: string) {
    if (!session) throw new Error("다시 입장해 주세요.");
    const controller = new AbortController(); commands.add(controller);
    const timeout = setTimeout(() => controller.abort(), 10000);
    const sentAt = Date.now();
    try {
      const snapshot = await postLoungeCommand(session, { ...input, commandId: id } as LoungeCommand, false, controller.signal);
      applySnapshot(snapshot, sentAt);
      return snapshot;
    } finally { clearTimeout(timeout); commands.delete(controller); }
  }

  function commandError(error: unknown) {
    if (!mounted || leaving) return;
    if (error instanceof LoungeClientError && error.status === 401) expire();
    else inform(error instanceof Error && error.name !== "AbortError" ? error.message : "응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.");
    schedulePoll(0);
  }

  function canMove() { return usable && me && !stunned && !currentAction && !sending; }

  function queueMove(point: LoungePoint) {
    engine?.move(point); queuedMove = clampPosition(point); moveVersion += 1;
    if (!moving) {
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = setTimeout(() => void flushMove(), Math.max(0, 40 - (Date.now() - lastMoveAt)));
    }
  }

  function moveTo(point: LoungePoint) {
    closeMenu(false); chatOpen = false; showHelp = false; plan = null;
    if (!canMove()) { if (stunned || currentAction) inform(block); return; }
    queueMove(point);
  }

  async function flushMove() {
    moveTimer = null;
    if (moving || !queuedMove || !canMove()) return;
    const point = queuedMove; queuedMove = null;
    const version = moveVersion; moving = true; lastMoveAt = Date.now();
    try { await request({ type: "move", ...point }, crypto.randomUUID()); }
    catch (error) { if (version === moveVersion) { engine?.rejectMove(); plan = null; commandError(error); } }
    finally { moving = false; if (queuedMove && mounted && !leaving) moveTimer = setTimeout(() => void flushMove(), 0); }
  }

  function nearby(point: LoungePoint) {
    return Boolean(me && distance(positionAt(me, now), point) <= loungeRules.interactionRange - 12 && distance(engine?.position() ?? positionAt(me, now), point) <= loungeRules.interactionRange - 12);
  }

  function approachPoint(point: LoungePoint) {
    const from = engine?.position() ?? (me ? positionAt(me, now) : point);
    const length = Math.max(1, distance(from, point));
    return clampPosition({ x: point.x + (from.x - point.x) / length * 58, y: point.y + (from.y - point.y) / length * 58 });
  }

  function choose(input: Extract<LoungeCommandInput, { type: "pickup" | "interact" }>) {
    closeMenu(false);
    if (!usable || sending || block) { if (block) inform(block); return; }
    const target = input.type === "pickup" ? room?.foods.find((food) => food.id === input.foodId) : room?.players.find((player) => player.id === input.targetId);
    if (!target) { inform("대상이 더 이상 여기에 없어요."); return; }
    const point = "move" in target ? positionAt(target, now) : target;
    if (nearby(point)) { void perform(input); return; }
    plan = { input, target: point, startedAt: now, lastSentAt: now };
    queueMove(approachPoint(point));
  }

  function advancePlan() {
    if (!plan || sending || !me || !room) return;
    if (!usable || stunned || currentAction || block || now - plan.startedAt > 15000) { plan = null; return; }
    const input = plan.input;
    const target = input.type === "pickup" ? room.foods.find((food) => food.id === input.foodId) : room.players.find((player) => player.id === input.targetId);
    if (!target) { plan = null; inform("대상이 더 이상 여기에 없어요."); return; }
    if ("move" in target && interactionBlock(target, now)) { plan = null; inform("상대가 다른 행동을 시작했어요."); return; }
    const point = "move" in target ? positionAt(target, now) : target;
    if (nearby(point) && !moving && !queuedMove) { plan = null; void perform(input); }
    else if (distance(point, plan.target) > 38 && now - plan.lastSentAt > 600) {
      plan = { ...plan, target: point, lastSentAt: now }; queueMove(approachPoint(point));
    }
  }

  async function perform(input: LoungeCommandInput) {
    if (!usable || !me || sending || stunned) return;
    if (!["respond", "cancel"].includes(input.type) && block) { inform(block); return; }
    closeMenu(false); plan = null; queuedMove = null; sending = true;
    const id = crypto.randomUUID(); engine?.unlockAudio();
    if (input.type === "eat") {
      const food = me.inventory.find((item) => item.id === input.foodId);
      if (food) { engine?.predict("eat", id, food.kind, food.id); inform(`${foodName(food.kind)} 냠!`); }
    } else if (input.type === "pickup") {
      const food = room?.foods.find((item) => item.id === input.foodId);
      if (food) engine?.predict("pickup", id, food.kind, food.id);
    } else if (input.type === "interact" && input.kind === "punch") engine?.predict("punch", id, undefined, undefined, input.targetId);
    else if (input.type === "respond" && input.accept && incoming) engine?.predict(incoming.kind, id, incoming.foodKind, undefined, incoming.fromId);
    try {
      await request(input, id); engine?.settle(id, true);
      if (input.type === "pickup") inform("주웠어요! 내 캐릭터를 우클릭해 먹어 보세요.");
    } catch (error) { engine?.settle(id, false); commandError(error); }
    finally { sending = false; }
  }

  async function openChat() {
    if (!usable || stunned) return;
    closeMenu(false); showHelp = false; chatOpen = true;
    await tick(); chatInput?.focus(); engine?.unlockAudio();
  }

  async function chat(event: SubmitEvent) {
    event.preventDefault();
    const text = chatDraft.trim();
    if (!text || !usable || stunned || chatting) return;
    const id = crypto.randomUUID(); chatting = true; chatDraft = ""; chatOpen = false;
    engine?.say(text, id); host?.focus({ preventScroll: true });
    try { await request({ type: "chat", text }, id); }
    catch (error) { chatDraft = text; commandError(error); }
    finally { engine?.finishSay(id); chatting = false; }
  }

  async function openMenu(target: LoungeMenuTarget) {
    if (!usable || stunned) return;
    chatOpen = false; showHelp = false; menu = target;
    await tick();
    if (!menu || !menuElement) return;
    const rect = menuElement.getBoundingClientRect();
    menu = { ...target, x: Math.max(8, Math.min(target.x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(target.y, window.innerHeight - rect.height - 8)) };
    menuElement.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });
  }

  function closeMenu(focus = true) { menu = null; if (focus) host?.focus({ preventScroll: true }); }
  function selfMenuOpen() { if (session && engine) void openMenu({ kind: "player", id: session.playerId, ...engine.selfScreen() }); }
  function outsideMenu(event: PointerEvent) { if (menu && event.target instanceof Node && !menuElement?.contains(event.target)) closeMenu(false); }
  function menuKeys(event: KeyboardEvent) {
    if (!menuElement || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const items = [...menuElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  }

  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape") { closeMenu(); chatOpen = false; showHelp = false; plan = null; return; }
    const target = event.target;
    if (target instanceof HTMLElement && target.closest("input,textarea,button,[role=menu]")) return;
    if (event.key === "Enter") { event.preventDefault(); void openChat(); }
    if (event.key === "?" || event.key === "F1") { event.preventDefault(); showHelp = !showHelp; }
    if (event.key === "ContextMenu") { event.preventDefault(); selfMenuOpen(); }
  }

  function toggleSound() { muted = !muted; engine?.setMuted(muted); if (!muted) engine?.unlockAudio(); void Storage.set("lounge.muted", muted).catch(() => {}); }
  function visibilityChanged() {
    if (document.hidden) { if (pollTimer) clearTimeout(pollTimer); pollAbort?.abort(); plan = null; queuedMove = null; }
    else { clockReady = false; bestRtt = Infinity; schedulePoll(0); }
  }

  async function exit() {
    if (leaving) return;
    leaving = true; queuedMove = null; plan = null;
    if (pollTimer) clearTimeout(pollTimer);
    pollAbort?.abort(); for (const controller of commands) controller.abort();
    if (session && connection !== "expired") {
      try { await postLoungeCommand(session, { type: "leave", commandId: crypto.randomUUID() }, true, AbortSignal.timeout(4500)); }
      catch { inform("퇴장 연결이 지연되고 있어요. 잠시 후 서버에서 자동으로 정리됩니다."); }
    }
    hasLeft = true; if (session) void forgetLoungeSession(session);
    await goto("/lounge");
  }

  onMount(() => {
    mounted = true;
    const timer = setInterval(() => { now = Date.now() + clockOffset; advancePlan(); if (stunned) { menu = null; chatOpen = false; queuedMove = null; } }, 100);
    void (async () => {
      const [loaded, savedMute] = await Promise.all([loadLoungeSession(channel.id), Storage.get<boolean>("lounge.muted").catch(() => null)]);
      if (!mounted) return;
      if (!loaded) { connection = "expired"; return; }
      session = loaded; muted = savedMute === true;
      const initial = takeInitialLoungeSnapshot(channel.id);
      if (initial) { room = initial; clockOffset = initial.serverNow - Date.now(); connection = "connected"; }
      try {
        const { LoungeScene } = await import("$lib/lounge/scene");
        if (!mounted || !host) return;
        engine = new LoungeScene(host, { selfId: loaded.playerId, getNow: () => Date.now() + clockOffset, onMove: moveTo,
          onContext: (target) => { void openMenu(target); }, onHover: (label) => { hover = label; }, onError: (message) => { sceneError = message; } });
        engine.setMuted(muted); if (room) engine.update(room); ready = true;
      } catch { sceneError = "3D 화면을 열지 못했어요. 브라우저의 그래픽 가속 설정을 확인하거나 다른 브라우저에서 입장해 주세요."; }
      await poll();
    })();
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pointerdown", outsideMenu); window.addEventListener("keydown", keyDown);
    return () => {
      mounted = false; clearInterval(timer); pollAbort?.abort(); for (const controller of commands) controller.abort();
      if (pollTimer) clearTimeout(pollTimer); if (moveTimer) clearTimeout(moveTimer); if (toastTimer) clearTimeout(toastTimer);
      engine?.dispose(); engine = null;
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pointerdown", outsideMenu); window.removeEventListener("keydown", keyDown);
      if (session && !hasLeft) { void postLoungeCommand(session, { type: "leave", commandId: crypto.randomUUID() }, true).catch(() => {}); void forgetLoungeSession(session); }
    };
  });
</script>

<svelte:head><title>{channel.name} · 라운지</title></svelte:head>

<section class="lounge-game" aria-label={`${channel.name} 3D 라운지`}>
  <div class="lounge-scene-host" bind:this={host} tabindex="0" role="application" aria-label="3D 게임 공간. 좌클릭 이동, 우클릭 행동. Enter 대화, Escape 닫기."></div>
  <header class="game-hud">
    <div class="game-channel"><span class="game-live-dot" class:offline={connection !== "connected"}></span><div><h1>{channel.name}</h1><span>{room?.players.length ?? 0} / {channel.capacity}명{#if connection === "reconnecting"} · 연결 중{/if}</span></div></div>
    <nav class="game-tools" aria-label="라운지 설정">
      <button type="button" class="game-tool sound-tool" onclick={toggleSound} aria-label={muted ? "효과음 켜기" : "효과음 끄기"} aria-pressed={!muted} title={muted ? "효과음 꺼짐" : "효과음 켜짐"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" />{#if muted}<path d="m16 9 5 6m0-6-5 6" />{:else}<path d="M15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14" />{/if}</svg></button>
      <button type="button" class="game-tool" onclick={() => { showHelp = !showHelp; closeMenu(false); chatOpen = false; }} aria-label="조작 안내" aria-expanded={showHelp}>?</button>
      <button type="button" class="game-tool exit-tool" disabled={leaving} onclick={() => void exit()}>{leaving ? "나가는 중" : "나가기"}</button>
    </nav>
  </header>
  {#if connection === "expired" || sceneError || !ready || !room}
    <div class="game-cover"><div class="game-cover-content">
      {#if connection === "expired"}<span class="game-cover-mark">↗</span><h2>다시 만나요.</h2><p>닉네임과 채널을 고르면 입장할 수 있어요.</p><a class="lounge-button primary" href="/lounge">입장 화면으로</a>
      {:else if sceneError}<span class="game-cover-mark">!</span><h2>공간을 열 수 없어요.</h2><p>{sceneError}</p><button class="lounge-button primary" type="button" onclick={() => location.reload()}>다시 불러오기</button><button class="lounge-button quiet" type="button" onclick={() => void exit()}>입장 화면으로</button>
      {:else}<div class="game-loading" aria-hidden="true"></div><h2>라운지를 열고 있어요.</h2><p>잠시 후 이곳에서 만나요.</p>{/if}
    </div></div>
  {/if}
  {#if ready && room && me && connection !== "expired" && !sceneError}
    {#if showHelp}<section class="game-help" aria-label="조작 안내"><header><h2>이렇게 놀아요.</h2><button type="button" class="game-tool" aria-label="안내 닫기" onclick={() => showHelp = false}>×</button></header><dl><div><dt>좌클릭 / 터치</dt><dd>원하는 곳으로 이동</dd></div><div><dt>우클릭 / 길게 누르기</dt><dd>캐릭터·음식의 행동 선택</dd></div><div><dt>내 캐릭터 우클릭</dt><dd>가지고 있는 음식 먹기</dd></div><div><dt>Enter</dt><dd>머리 위로 한마디</dd></div><div><dt>마우스 휠 / + −</dt><dd>화면 확대·축소</dd></div></dl><p>악수·포옹·선물은 상대가 수락하면 시작돼요. 펀치를 맞으면 1.5초 동안 쉬어요.</p><p>음식은 1분마다 누군가의 근처에 하나씩 떨어져요.</p></section>{/if}
    {#if incoming || outgoing}<div class="game-consent" role="region" aria-label="상호작용 요청" aria-live="polite"><div><span class="game-eyebrow">{incoming ? "함께할까요?" : "응답을 기다리고 있어요"} <small aria-live="off">{requestSeconds}초</small></span><strong>{incoming ? `${requester?.nickname ?? "상대"} 님의 ${incoming.kind === "give" ? foodName(incoming.foodKind ?? "") + " 선물" : actionNames[incoming.kind]}` : `${receiver?.nickname ?? "상대"} 님에게 ${outgoing ? actionNames[outgoing.kind] : ""} 요청`}</strong></div><div class="game-consent-actions">{#if incoming}<button class="lounge-button secondary" type="button" disabled={sending || stunned} onclick={() => void perform({ type: "respond", requestId: incoming!.id, accept: false })}>거절</button><button class="lounge-button primary" type="button" disabled={sending || stunned} onclick={() => void perform({ type: "respond", requestId: incoming!.id, accept: true })}>수락</button>{:else if outgoing}<button class="lounge-button secondary" type="button" disabled={sending || stunned} onclick={() => void perform({ type: "cancel", requestId: outgoing!.id })}>취소</button>{/if}</div></div>{/if}
    {#if stunned}<div class="game-stun" role="status">잠깐, 별이 보여요… <strong aria-hidden="true">{Math.max(0, (me.stunnedUntil - now) / 1000).toFixed(1)}초</strong></div>
    {:else if currentAction}<div class="game-action" aria-live="polite">{currentAction.kind === "eat" ? "냠냠!" : actionNames[currentAction.kind]}<span class="game-action-progress" style={`--progress:${Math.max(0, Math.min(1, (currentAction.endsAt - now) / (currentAction.endsAt - currentAction.startedAt)))}`} aria-hidden="true"></span></div>
    {:else if plan}<div class="game-approach" role="status"><span>가까이 가는 중…</span><button type="button" onclick={() => { plan = null; }}>행동 취소</button></div>{/if}
    <div class="game-bottom">
      {#if toast}<div class="game-toast" role="status">{toast}</div>{:else if connection === "reconnecting"}<div class="game-toast" role="status">연결을 다시 확인하고 있어요.</div>{:else if lastNotice && now - lastNotice.createdAt < 6000}<div class="game-notice" aria-live="polite">{lastNotice.text}</div>{/if}
      {#if chatOpen}<form class="game-chat" onsubmit={chat}><label for="lounge-chat" class="sr-only">머리 위에 띄울 말</label><span class="game-chat-name">{me.nickname}</span><input id="lounge-chat" bind:this={chatInput} bind:value={chatDraft} maxlength={loungeRules.chatMaxLength} autocomplete="off" placeholder="가볍게 한마디…" disabled={stunned || !usable} /><button class="lounge-button primary" type="submit" disabled={!chatDraft.trim() || chatting || stunned || !usable}>보내기</button><button class="game-tool" type="button" aria-label="대화 입력 닫기" onclick={() => { chatOpen = false; host?.focus(); }}>×</button></form>
      {:else}<div class="game-bottom-row"><div class="game-play-tools"><button class="game-chat-open" type="button" disabled={stunned || !usable || chatting} onclick={() => void openChat()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 10c0 4-4 7-8 7H7l-4 4V10c0-4 4-7 9-7s8 3 8 7Z" /></svg>한마디 <kbd>Enter</kbd></button><button class="game-self-button" type="button" disabled={stunned || !usable} onclick={selfMenuOpen}><i style={`background:${me.color}`}></i>내 캐릭터</button></div><span class="game-hint">{hover ? `${hover} · 우클릭으로 행동` : "좌클릭 이동 · 우클릭 행동"}</span><div class="game-zoom"><button class="game-tool" type="button" aria-label="축소" onclick={() => engine?.zoom(-0.12)}>−</button><button class="game-tool" type="button" aria-label="확대" onclick={() => engine?.zoom(0.12)}>+</button></div></div>{/if}
    </div>
    <div class="sr-only" role="log" aria-label="라운지 대화" aria-live="polite" aria-relevant="additions">{#each room.messages.slice(-4) as message (message.id)}<p>{message.nickname}: {message.text}</p>{/each}</div>
  {/if}
  {#if menu && me && room}
    <div class="lounge-context-menu" bind:this={menuElement} role="menu" tabindex="-1" aria-label={menuPlayer ? `${menuPlayer.nickname} 행동` : "음식 행동"} style={`left:${menu.x}px;top:${menu.y}px;`} onkeydown={menuKeys}>
      <header><div><strong>{menuPlayer?.nickname ?? (menuFood ? foodName(menuFood.kind) : "대상이 사라졌어요")}</strong><span>{selfMenu ? "내 캐릭터" : menu?.kind === "food" ? "바닥에 떨어진 음식" : "함께 놀기"}</span></div><button type="button" class="game-tool" aria-label="행동 메뉴 닫기" onclick={() => closeMenu()}>×</button></header>
      {#if menuFood}<button type="button" role="menuitem" disabled={sending || Boolean(block) || me.inventory.length >= loungeRules.inventoryCapacity} onclick={() => choose({ type: "pickup", foodId: menuFood!.id })}><FoodIcon kind={menuFood.kind} size={26} /><span>{nearby(menuFood) ? "줍기" : "다가가서 줍기"}</span></button>{#if block}<p class="context-hint">{block}</p>{:else if me.inventory.length >= loungeRules.inventoryCapacity}<p class="context-hint">음식은 {loungeRules.inventoryCapacity}개까지 들 수 있어요.</p>{/if}
      {:else if menuPlayer && selfMenu}<p class="context-section-label">가지고 있는 음식 <span>{me.inventory.length} / {loungeRules.inventoryCapacity}</span></p>{#if !me.inventory.length}<p class="context-hint">아직 음식이 없어요. 바닥에 떨어지면 주워 보세요.</p>{/if}{#each me.inventory as food (food.id)}<button type="button" role="menuitem" disabled={sending || Boolean(block)} onclick={() => void perform({ type: "eat", foodId: food.id })}><FoodIcon kind={food.kind} size={26} /><span>{foodName(food.kind)} 먹기</span></button>{/each}{#if block}<p class="context-hint">{block}</p>{/if}
      {:else if menuPlayer}<button type="button" role="menuitem" disabled={sending || Boolean(targetBlock)} onclick={() => choose({ type: "interact", kind: "handshake", targetId: menuPlayer!.id })}><span>악수하기</span><small>상대 동의</small></button><button type="button" role="menuitem" disabled={sending || Boolean(targetBlock)} onclick={() => choose({ type: "interact", kind: "hug", targetId: menuPlayer!.id })}><span>포옹하기</span><small>상대 동의</small></button>{#if me.inventory.length}<p class="context-section-label">음식 건네기 · 상대 동의</p>{#each me.inventory as food (food.id)}<button type="button" role="menuitem" disabled={sending || Boolean(targetBlock) || menuPlayer.inventory.length >= loungeRules.inventoryCapacity} onclick={() => choose({ type: "interact", kind: "give", targetId: menuPlayer!.id, foodId: food.id })}><FoodIcon kind={food.kind} size={24} /><span>{foodName(food.kind)} 건네기</span></button>{/each}{/if}<button type="button" role="menuitem" class="punch-menu-item" disabled={sending || Boolean(targetBlock)} onclick={() => choose({ type: "interact", kind: "punch", targetId: menuPlayer!.id })}><span>펀치하기</span><small>즉시 실행</small></button>{#if targetBlock}<p class="context-hint">{targetBlock}</p>{:else if !nearby(positionAt(menuPlayer, now))}<p class="context-hint">가까이 다가간 뒤 행동해요.</p>{/if}
      {:else}<p class="context-hint">다른 캐릭터나 음식을 선택해 주세요.</p>{/if}
    </div>
  {/if}
</section>
