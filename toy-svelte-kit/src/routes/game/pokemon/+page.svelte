<script lang="ts">
  import type { PokemonDetailItem, PokemonDetailPayload, PokemonKoItem } from "$lib";
  import pokemonDetailData from "$lib/assets/data/pokemon/pokemon_detail.json";
  import { onMount } from "svelte";

  const PAGE_SIZE = 24;
  const pokemonPayload = pokemonDetailData as PokemonDetailPayload;

  let loading = $state(true);
  let errorMessage = $state("");
  let items = $state<PokemonKoItem[]>([]);
  let fetchedAtLabel = $state("");
  let searchName = $state("");
  let searchDexNo = $state("");
  let visibleCount = $state(PAGE_SIZE);
  let sentinelEl = $state<HTMLDivElement | null>(null);
  let infiniteObserver: IntersectionObserver | null = null;

  const normalizedDexQuery = $derived(searchDexNo.replace(/\D/g, ""));

  const filteredItems = $derived(
    items.filter((item) => {
      const nameQuery = searchName.trim().toLowerCase();
      const dexQuery = normalizedDexQuery;
      const nameMatched = nameQuery
        ? item.name.toLowerCase().includes(nameQuery)
        : true;
      const dexMatched = dexQuery ? item.id === Number(dexQuery) : true;
      return nameMatched && dexMatched;
    }),
  );

  const visibleItems = $derived(filteredItems.slice(0, visibleCount));
  const hasMore = $derived(visibleCount < filteredItems.length);

  $effect(() => {
    searchName;
    normalizedDexQuery;
    visibleCount = PAGE_SIZE;
  });

  function loadMore() {
    if (!hasMore) {
      return;
    }

    visibleCount = Math.min(filteredItems.length, visibleCount + PAGE_SIZE);
  }

  function formatDateTime(timestamp: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  }

  function applyNameFilter(name: string) {
    searchName = name;
    searchDexNo = "";
  }

  function findEvolutionPath(
    node: PokemonDetailItem["evolutionTree"],
    targetName: string,
    parentName: string | null = null,
  ): { from: string | null; to: string[] } | null {
    if (node.name === targetName) {
      return {
        from: parentName,
        to: node.children.map((child) => child.name),
      };
    }

    for (const child of node.children) {
      const found = findEvolutionPath(child, targetName, node.name);
      if (found) {
        return found;
      }
    }

    return null;
  }

  function toViewItem(item: PokemonDetailItem): PokemonKoItem {
    const evolution =
      findEvolutionPath(item.evolutionTree, item.name) ?? {
        from: null,
        to: item.evolutionMethods.map((entry) => entry.to),
      };

    return {
      id: item.dexNo,
      name: item.name,
      imageUrl: item.imageUrl,
      types: item.types,
      baseStats: item.baseStats,
      evolution,
      generation: "",
      abilities: item.abilities,
    } satisfies PokemonKoItem;
  }

  function loadPokemon() {
    loading = true;
    errorMessage = "";

    try {
      items = pokemonPayload.items.map(toViewItem);
      fetchedAtLabel = formatDateTime(pokemonPayload.generatedAt);
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "포켓몬 데이터를 불러오지 못했습니다.";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (!sentinelEl) {
      return;
    }

    if (infiniteObserver) {
      infiniteObserver.disconnect();
    }

    infiniteObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMore();
          }
        }
      },
      { root: null, rootMargin: "280px 0px", threshold: 0 },
    );

    infiniteObserver.observe(sentinelEl);
  });

  onMount(() => {
    loadPokemon();

    return () => {
      if (infiniteObserver) {
        infiniteObserver.disconnect();
      }
    };
  });
</script>

<section class="pokemon-page">
  <div class="hero">
    <p class="eyebrow">Pokemon Explorer</p>
    <h1>Pokebook</h1>
    {#if !loading && !errorMessage}
      <p class="meta">{items.length}마리 | {fetchedAtLabel}</p>
    {/if}
  </div>

  {#if loading}
    <p class="status">데이터 준비 중...</p>
  {:else if errorMessage}
    <p class="status error">{errorMessage}</p>
  {:else}
    <div class="search">
      <label>
        이름
        <input type="text" bind:value={searchName} placeholder="예: 피카츄" />
      </label>
      <label>
        도감번호
        <input
          type="text"
          inputmode="numeric"
          bind:value={searchDexNo}
          placeholder="예: 25"
        />
      </label>
    </div>

    <p class="result">조회 결과 {filteredItems.length}마리</p>

    <ul class="list">
      {#each visibleItems as item}
        <li class="card">
          <header class="card-head">
            <p class="dex">#{item.id}</p>
            <h2>{item.name}</h2>
          </header>

          <div class="photo-wrap">
            <img src={item.imageUrl ?? ""} alt={`${item.name} 이미지`} loading="lazy" />
          </div>

          <div class="row">
            <strong>타입</strong><span>{item.types.join(" / ")}</span>
          </div>
          <div class="row">
            <strong>특성</strong><span>{item.abilities.join(", ")}</span>
          </div>
          <div class="row">
            <strong>총 종족값</strong><span>{item.baseStats.total}</span>
          </div>

          <div class="stats">
            <div class="stat"><span>체력</span><b>{item.baseStats.hp}</b></div>
            <div class="stat"><span>공격</span><b>{item.baseStats.attack}</b></div>
            <div class="stat">
              <span>특수공격</span><b>{item.baseStats.specialAttack}</b>
            </div>
            <div class="stat"><span>방어</span><b>{item.baseStats.defense}</b></div>
            <div class="stat">
              <span>특수방어</span><b>{item.baseStats.specialDefense}</b>
            </div>
            <div class="stat"><span>스피드</span><b>{item.baseStats.speed}</b></div>
          </div>

          <div class="evolution">
            <button
              type="button"
              class="evo-btn devolve"
              disabled={!item.evolution.from}
              onclick={() =>
                item.evolution.from && applyNameFilter(item.evolution.from)}
            >
              퇴화{item.evolution.from ? `: ${item.evolution.from}` : ""}
            </button>

            {#if item.evolution.to.length}
              {#each item.evolution.to as evo}
                <button
                  type="button"
                  class="evo-btn evolve"
                  onclick={() => applyNameFilter(evo)}
                >
                  진화: {evo}
                </button>
              {/each}
            {:else}
              <button type="button" class="evo-btn evolve" disabled>진화 없음</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    {#if filteredItems.length === 0}
      <p class="status">조회 결과가 없습니다.</p>
    {/if}

    <div bind:this={sentinelEl} class="sentinel" aria-hidden="true"></div>
    {#if hasMore}
      <p class="status">스크롤해 더 불러오세요.</p>
    {/if}
  {/if}
</section>

<style>
  .pokemon-page {
    --ink: #0f172a;
    --muted: #475569;
    --surface: #ffffff;
    --line: rgba(148, 163, 184, 0.3);
    --teal: #0f766e;
    --rose: #be123c;
    max-width: 1140px;
    margin: 0 auto;
    padding: 20px 0 32px;
  }

  .hero {
    margin-bottom: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    background: radial-gradient(
        circle at 0% 0%,
        rgba(14, 165, 233, 0.25),
        transparent 36%
      ),
      radial-gradient(
        circle at 100% 100%,
        rgba(16, 185, 129, 0.2),
        transparent 34%
      ),
      linear-gradient(160deg, #f8fafc 0%, #ffffff 52%, #eef2ff 100%);
    border: 1px solid #dbeafe;
  }

  .eyebrow {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0369a1;
  }

  h1 {
    margin: 6px 0 0;
    font-size: 38px;
    line-height: 1.02;
    letter-spacing: -0.03em;
    color: #0f172a;
  }

  .meta {
    margin: 8px 0 0;
    font-size: 13px;
    color: #334155;
    font-weight: 700;
  }

  .search {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 8px;
  }

  .search label {
    display: grid;
    gap: 4px;
    font-size: 12px;
    font-weight: 700;
    color: #334155;
  }

  .search input {
    height: 40px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    padding: 0 11px;
    font-size: 14px;
    color: #0f172a;
    background: #fff;
  }

  .search input:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15);
  }

  .result {
    margin: 0 0 12px;
    color: #334155;
    font-size: 14px;
    font-weight: 700;
  }

  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .card {
    border: 1px solid var(--line);
    border-radius: 16px;
    background: radial-gradient(
        circle at 100% 0%,
        rgba(186, 230, 253, 0.25),
        transparent 44%
      ),
      var(--surface);
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.09);
    padding: 12px;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 30px rgba(15, 23, 42, 0.12);
  }

  .card-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .dex {
    margin: 0;
    font-family: "Consolas", "Courier New", monospace;
    color: var(--muted);
    font-weight: 700;
    font-size: 13px;
  }

  h2 {
    margin: 0;
    font-size: 22px;
    line-height: 1.1;
    color: var(--ink);
  }

  .photo-wrap {
    margin-top: 10px;
    height: 164px;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: radial-gradient(
        circle at 20% 20%,
        rgba(14, 165, 233, 0.16),
        transparent 36%
      ),
      radial-gradient(
        circle at 80% 80%,
        rgba(16, 185, 129, 0.13),
        transparent 36%
      ),
      #fff;
    place-items: center;
    overflow: hidden;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 8px;
  }

  .row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-top: 8px;
    font-size: 13px;
  }

  .row strong {
    color: #334155;
    min-width: 72px;
  }

  .row span {
    text-align: right;
    color: var(--ink);
    font-weight: 700;
  }

  .stats {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .stat {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: #fff;
    padding: 7px 6px;
    text-align: center;
  }

  .stat span {
    display: block;
    font-size: 11px;
    color: #64748b;
    font-weight: 700;
  }

  .stat b {
    display: block;
    margin-top: 3px;
    font-size: 16px;
    color: var(--ink);
  }

  .evolution {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }

  .evo-btn {
    height: 30px;
    border-radius: 999px;
    padding: 0 10px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid transparent;
    transition: filter 0.16s ease;
  }

  .evolve {
    background: #dcfce7;
    border-color: #86efac;
    color: #166534;
  }

  .devolve {
    background: #ffe4e6;
    border-color: #fda4af;
    color: #9f1239;
  }

  .evo-btn:hover:enabled {
    filter: brightness(0.96);
  }

  .evo-btn:disabled {
    color: #94a3b8;
    border-color: #e2e8f0;
    background: #f8fafc;
    cursor: not-allowed;
  }

  .status {
    margin: 0;
    color: #334155;
    font-size: 14px;
  }

  .status.error {
    color: #b91c1c;
  }

  .sentinel {
    width: 100%;
    height: 1px;
  }

  @media (max-width: 1024px) {
    .list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .search {
      grid-template-columns: minmax(0, 1fr);
    }

    .list {
      grid-template-columns: minmax(0, 1fr);
    }

    h1 {
      font-size: 32px;
    }
  }

  :global(html[data-theme="dark"]) .pokemon-page {
    --ink: #e5eefc;
    --muted: #a8b6cc;
    --surface: #111827;
    --line: rgba(148, 163, 184, 0.22);
  }

  :global(html[data-theme="dark"]) .pokemon-page .hero {
    background:
      radial-gradient(circle at 0% 0%, rgba(56, 189, 248, 0.18), transparent 36%),
      radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.14), transparent 34%),
      linear-gradient(160deg, #0f172a 0%, #111827 52%, #172033 100%);
    border-color: rgba(96, 165, 250, 0.22);
  }

  :global(html[data-theme="dark"]) .pokemon-page .eyebrow {
    color: #7dd3fc;
  }

  :global(html[data-theme="dark"]) .pokemon-page h1,
  :global(html[data-theme="dark"]) .pokemon-page h2,
  :global(html[data-theme="dark"]) .pokemon-page .row span,
  :global(html[data-theme="dark"]) .pokemon-page .stat b,
  :global(html[data-theme="dark"]) .pokemon-page .search input {
    color: #f8fbff;
  }

  :global(html[data-theme="dark"]) .pokemon-page .meta,
  :global(html[data-theme="dark"]) .pokemon-page .result,
  :global(html[data-theme="dark"]) .pokemon-page .search label,
  :global(html[data-theme="dark"]) .pokemon-page .row strong,
  :global(html[data-theme="dark"]) .pokemon-page .stat span,
  :global(html[data-theme="dark"]) .pokemon-page .status,
  :global(html[data-theme="dark"]) .pokemon-page .dex {
    color: #a8b6cc;
  }

  :global(html[data-theme="dark"]) .pokemon-page .card {
    background:
      radial-gradient(circle at 100% 0%, rgba(56, 189, 248, 0.14), transparent 44%),
      linear-gradient(180deg, #111827 0%, #0f172a 100%);
    border-color: rgba(148, 163, 184, 0.22);
    box-shadow: 0 14px 30px rgba(2, 6, 23, 0.34);
  }

  :global(html[data-theme="dark"]) .pokemon-page .photo-wrap {
    background:
      radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.14), transparent 36%),
      radial-gradient(circle at 80% 80%, rgba(16, 185, 129, 0.1), transparent 36%),
      #0b1220;
    border-color: rgba(148, 163, 184, 0.18);
  }

  :global(html[data-theme="dark"]) .pokemon-page .search input,
  :global(html[data-theme="dark"]) .pokemon-page .stat {
    background: #0f172a;
    border-color: rgba(148, 163, 184, 0.22);
  }

  :global(html[data-theme="dark"]) .pokemon-page .search input::placeholder {
    color: #64748b;
  }

  :global(html[data-theme="dark"]) .pokemon-page .search input:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.18);
  }

  :global(html[data-theme="dark"]) .pokemon-page .evolve {
    background: rgba(34, 197, 94, 0.16);
    border-color: rgba(74, 222, 128, 0.34);
    color: #bbf7d0;
  }

  :global(html[data-theme="dark"]) .pokemon-page .devolve {
    background: rgba(244, 63, 94, 0.16);
    border-color: rgba(251, 113, 133, 0.34);
    color: #fecdd3;
  }

  :global(html[data-theme="dark"]) .pokemon-page .evo-btn:disabled {
    background: #0f172a;
    border-color: rgba(148, 163, 184, 0.18);
    color: #64748b;
  }

  :global(html[data-theme="dark"]) .pokemon-page .status.error {
    color: #fca5a5;
  }
</style>
