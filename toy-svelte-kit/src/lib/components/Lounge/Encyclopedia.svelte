<script lang="ts">
  import FishIcon from "./FishIcon.svelte";
  import InsectIcon from "./InsectIcon.svelte";
  import MonsterIcon from "./MonsterIcon.svelte";
  import settings from "$lib/assets/data/lounge/encyclopedia.json";
  import { describeFish, fishLength } from "$lib/lounge/fishing";
  import { describeInsect } from "$lib/lounge/insects";
  import { describeMonster } from "$lib/lounge/monsters";
  import { encyclopedia, encyclopediaFish, encyclopediaInsects, encyclopediaMonsters, refreshEncyclopedia, retryEncyclopedia } from "$lib/client/encyclopedia.svelte.js";
  import type { LoungeEncyclopediaProps, LoungeCollectionCategory, LoungeEncyclopediaKind, LoungeEncyclopediaDisplayRecord } from "$lib/types/LoungeEncyclopedia";
  import type { LoungeMonsterKind } from "$lib/types/LoungeMonster";
  import type { LoungeFishKind } from "$lib/types/Lounge";
  import type { LoungeInsectKind } from "$lib/types/LoungeInsect";

  let { open, onClose }: LoungeEncyclopediaProps = $props();
  let dialog = $state<HTMLDialogElement | null>(null);
  let category = $state<LoungeCollectionCategory>("fish");
  let selected = $state<LoungeEncyclopediaKind>("carp");
  const kinds = $derived(category === "monsters" ? encyclopediaMonsters : category === "fish" ? encyclopediaFish : encyclopediaInsects);
  const records = $derived(encyclopedia[category] as Partial<Record<LoungeEncyclopediaKind, LoungeEncyclopediaDisplayRecord>>);
  const count = $derived(kinds.filter((kind) => records[kind]).length);
  const label = $derived(category === "monsters" ? "몬스터" : category === "fish" ? "물고기" : "곤충");
  const species = $derived(describe(selected));
  const record = $derived(records[selected]);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) { dialog.showModal(); void refreshEncyclopedia(); }
    else if (!open && dialog.open) dialog.close();
  });
  function chooseCategory(value: string) {
    category = value === "monsters" ? "monsters" : value === "insects" ? "insects" : "fish";
    selected = category === "monsters" ? "hornRabbit" : category === "fish" ? "carp" : "caterpillar";
  }
  function describe(kind: LoungeEncyclopediaKind) { return category === "monsters" ? describeMonster(kind as LoungeMonsterKind) : category === "fish" ? describeFish(kind as LoungeFishKind) : describeInsect(kind as LoungeInsectKind); }
  function summary(found?: LoungeEncyclopediaDisplayRecord) { return !found ? "미발견" : "defeatedAt" in found ? "처치 완료" : fishLength(found.sizeCm); }
  function discovered(value: string) { return Object.keys(encyclopedia[value as LoungeCollectionCategory]).length; }
  function tabs(event: KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = settings.categories.findIndex((tab) => tab.id === category);
    const next = event.key === "Home" ? 0 : event.key === "End" ? settings.categories.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + settings.categories.length) % settings.categories.length;
    chooseCategory(settings.categories[next].id);
    dialog?.querySelector<HTMLButtonElement>(`#encyclopedia-tab-${category}`)?.focus();
  }
</script>

<dialog id="lounge-encyclopedia" class="encyclopedia" bind:this={dialog} aria-labelledby="encyclopedia-title" onclose={onClose}
  oncancel={(event) => { event.preventDefault(); onClose(); }} onkeydown={(event) => event.stopPropagation()}>
  <header class="encyclopedia-header"><div><h2 id="encyclopedia-title">도감</h2><p>{count === 6 ? `${label} 도감을 완성했어요.` : `${label} ${count} / 6종`}</p></div><button type="button" class="game-tool" aria-label="도감 닫기" onclick={onClose}>×</button></header>
  <div class="encyclopedia-tabs" role="tablist" aria-label="도감 종류">
    {#each settings.categories as tab}
      <button type="button" role="tab" id={`encyclopedia-tab-${tab.id}`} aria-controls="encyclopedia-panel" aria-selected={category === tab.id} tabindex={category === tab.id ? 0 : -1} onkeydown={tabs} onclick={() => chooseCategory(tab.id)}>{tab.name}<span>{discovered(tab.id)}/6</span></button>
    {/each}
  </div>
  <section role="tabpanel" id="encyclopedia-panel" aria-labelledby={`encyclopedia-tab-${category}`} tabindex="0" class="encyclopedia-panel">
    {#if encyclopedia.loading && !encyclopedia.loaded}<p class="encyclopedia-empty" role="status">도감을 불러오는 중…</p>
    {:else if encyclopedia.error && !encyclopedia.loaded}<div class="encyclopedia-empty"><p>{encyclopedia.error}</p><button type="button" class="lounge-button secondary" onclick={retryEncyclopedia}>다시 시도</button></div>
    {:else}
      <div class="encyclopedia-progress" role="progressbar" aria-label={`${label} 도감 완성도`} aria-valuenow={count} aria-valuemin="0" aria-valuemax="6"><span style={`width:${count / 6 * 100}%`}></span></div>
      <div class="encyclopedia-content">
        <div class="encyclopedia-grid" aria-label={`${label} 6종`}>
          {#each kinds as kind}
            {@const item = describe(kind)}
            {@const found = records[kind]}
            <button type="button" class="encyclopedia-entry" class:undiscovered={!found} class:selected={selected === kind} aria-pressed={selected === kind}
              aria-label={`${item.name}, ${summary(found)}`} aria-describedby={selected === kind ? "encyclopedia-detail" : undefined}
              onpointerenter={(event) => { if (event.pointerType !== "touch") selected = kind; }} onfocus={() => selected = kind} onclick={() => selected = kind}>
              <span class="encyclopedia-icon">{#if category === "monsters"}<MonsterIcon kind={kind as LoungeMonsterKind} />{:else if category === "fish"}<FishIcon kind={kind as LoungeFishKind} />{:else}<InsectIcon kind={kind as LoungeInsectKind} />{/if}</span><strong>{item.name}</strong><small>{summary(found)}</small>
            </button>
          {/each}
        </div>
        <aside id="encyclopedia-detail" class="encyclopedia-detail" class:undiscovered={!record} aria-live="polite">
          <div class="encyclopedia-portrait">{#if category === "monsters"}<MonsterIcon kind={selected as LoungeMonsterKind} />{:else if category === "fish"}<FishIcon kind={selected as LoungeFishKind} />{:else}<InsectIcon kind={selected as LoungeInsectKind} />{/if}</div>
          <span class="encyclopedia-grade">{species.grade}등급</span><h3>{species.name}</h3>
          {#if record && "defeatedAt" in record}<dl><dt>체력</dt><dd>{describeMonster(selected as LoungeMonsterKind).hp}</dd></dl><time datetime={new Date(record.defeatedAt).toISOString()}>{new Date(record.defeatedAt).toLocaleDateString("ko-KR")} 처치</time>
          {:else if record && "sizeCm" in record}<dl><dt>최대 기록</dt><dd>{fishLength(record.sizeCm)}</dd></dl><time datetime={new Date(record.caughtAt).toISOString()}>{new Date(record.caughtAt).toLocaleDateString("ko-KR")} 포획</time>
          {:else}<p>아직 만나지 못했어요.</p>{/if}
        </aside>
      </div>
    {/if}
  </section>
  <footer class="encyclopedia-footer"><div role="status">{#if encyclopedia.error}<span>{encyclopedia.error}</span><button type="button" onclick={retryEncyclopedia}>다시 시도</button>{:else if encyclopedia.saving}기록을 저장하는 중…{:else if encyclopedia.updatedAt}기록이 저장됐어요.{/if}</div><p>7일 동안 새 기록이 없으면 도감이 초기화돼요.</p></footer>
</dialog>

<style>
  .encyclopedia { box-sizing: border-box; width: min(740px, calc(100vw - 32px)); max-height: calc(100dvh - 40px); padding: 0; overflow: auto; border: 1px solid var(--line-strong); border-radius: 16px; background: var(--surface); color: var(--text-strong); box-shadow: var(--shadow-float); }
  .encyclopedia::backdrop { background: rgb(0 0 0 / .38); }
  .encyclopedia button { font: inherit; cursor: pointer; }
  .encyclopedia button:focus-visible, .encyclopedia-panel:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
  .encyclopedia-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 24px 24px 16px; }
  h2, h3, p { margin: 0; } h2 { font-size: 23px; letter-spacing: -.025em; }
  .encyclopedia-header p { margin-top: 6px; font-size: 13px; color: var(--muted); }
  .encyclopedia-tabs { display: flex; gap: 24px; padding-inline: 24px; border-bottom: 1px solid var(--line); }
  .encyclopedia-tabs button { display: flex; gap: 8px; align-items: center; min-height: 44px; padding: 0 0 12px; border: 0; border-bottom: 2px solid transparent; color: var(--muted); background: none; font-weight: 650; }
  .encyclopedia-tabs button[aria-selected="true"] { color: var(--text-strong); border-bottom-color: var(--brand); }
  .encyclopedia-tabs span { font-size: 12px; font-variant-numeric: tabular-nums; }
  .encyclopedia-panel { padding: 24px; }
  .encyclopedia-progress { height: 4px; overflow: hidden; margin-bottom: 24px; border-radius: 2px; background: var(--surface-strong); }
  .encyclopedia-progress span { display: block; height: 100%; background: var(--brand); }
  .encyclopedia-content { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(190px, 1fr); gap: 24px; }
  .encyclopedia-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .encyclopedia-entry { min-width: 0; padding: 10px 6px 12px; border: 1px solid transparent; border-radius: 10px; color: var(--text-strong); background: var(--surface-muted); }
  .encyclopedia-entry:hover, .encyclopedia-entry.selected { border-color: var(--brand); }
  .encyclopedia-entry strong, .encyclopedia-entry small { display: block; }.encyclopedia-entry strong { font-size: 13px; }.encyclopedia-entry small { margin-top: 4px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .encyclopedia-icon { display: block; margin-bottom: 8px; }.encyclopedia-icon :global(svg) { width: 100%; height: 56px; }
  .undiscovered .encyclopedia-icon, .undiscovered .encyclopedia-portrait { filter: grayscale(1); opacity: .42; }.encyclopedia-entry.undiscovered strong { color: var(--muted); }
  .encyclopedia-detail { align-self: stretch; padding: 12px 8px; }.encyclopedia-portrait { margin-bottom: 12px; }.encyclopedia-portrait :global(svg) { width: 100%; height: 100px; }
  .encyclopedia-grade { color: var(--muted); font-size: 12px; }.encyclopedia-detail h3 { margin-top: 4px; font-size: 21px; }.encyclopedia-detail dl { margin: 20px 0 6px; }.encyclopedia-detail dt { color: var(--muted); font-size: 12px; }.encyclopedia-detail dd { margin: 4px 0 0; font-size: 27px; font-weight: 700; font-variant-numeric: tabular-nums; }.encyclopedia-detail time, .encyclopedia-detail p { color: var(--muted); font-size: 12px; line-height: 1.7; }.encyclopedia-detail p { margin-top: 16px; }
  .encyclopedia-empty { display: grid; min-height: 220px; place-content: center; justify-items: center; gap: 14px; color: var(--muted); text-align: center; font-size: 14px; }
  .encyclopedia-footer { padding: 0 24px 20px; color: var(--muted); font-size: 12px; line-height: 1.7; }.encyclopedia-footer div { min-height: 20px; }.encyclopedia-footer p { margin-top: 5px; }.encyclopedia-footer button { margin-left: 8px; border: 0; background: none; color: var(--brand-strong); text-decoration: underline; text-underline-offset: 3px; }
  @media (max-width: 600px) { .encyclopedia { width: calc(100vw - 20px); max-height: calc(100dvh - 24px); }.encyclopedia-header { padding: 18px 16px 12px; }.encyclopedia-tabs { padding-inline: 16px; }.encyclopedia-panel { padding: 18px 16px; }.encyclopedia-content { grid-template-columns: 1fr; gap: 18px; }.encyclopedia-grid { gap: 8px; }.encyclopedia-detail { display: grid; grid-template-columns: 96px 1fr; column-gap: 16px; padding: 8px 0; }.encyclopedia-portrait { grid-row: 1 / span 5; margin: 0; align-self: center; }.encyclopedia-portrait :global(svg) { height: 76px; }.encyclopedia-detail dl { margin-top: 10px; }.encyclopedia-detail p { margin-top: 8px; }.encyclopedia-footer { padding-inline: 16px; } }
</style>
