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
  const hasActiveSearch = $derived(Boolean(searchName.trim() || normalizedDexQuery));

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

  function artworkUrl(dexNo: number) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNo}.png`;
  }

  function fallbackSpriteUrl(dexNo: number) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dexNo}.png`;
  }

  function handleImageError(event: Event, dexNo: number) {
    const image = event.currentTarget as HTMLImageElement;

    if (image.dataset.fallbackApplied === "true") {
      image.hidden = true;
      return;
    }

    image.dataset.fallbackApplied = "true";
    image.src = fallbackSpriteUrl(dexNo);
  }

  function clearSearch() {
    searchName = "";
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
      imageUrl: artworkUrl(item.dexNo),
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
  {#if loading}
    <p class="status">데이터 준비 중...</p>
  {:else if errorMessage}
    <div class="status-panel" role="alert">
      <p class="status error">{errorMessage}</p>
      <button type="button" class="retry-button" onclick={loadPokemon}>다시 시도</button>
    </div>
  {:else}
    <div class="search">
      <label>
        이름
        <input type="search" bind:value={searchName} placeholder="예: 피카츄" />
      </label>
      <label>
        도감번호
        <input
          type="text"
          inputmode="numeric"
          bind:value={searchDexNo}
          placeholder="예: 25"
          oninput={() => (searchDexNo = searchDexNo.replace(/\D/g, ""))}
        />
      </label>
    </div>

    <div class="result">
      <p>조회 결과 {filteredItems.length}마리</p>
      {#if hasActiveSearch}
        <button type="button" onclick={clearSearch}>검색 초기화</button>
      {/if}
    </div>

    <ul class="list">
      {#each visibleItems as item}
        <li class="card">
          <header class="card-head">
            <p class="dex">#{item.id}</p>
            <h2>{item.name}</h2>
          </header>

          <div class="photo-wrap">
            {#if item.imageUrl}
              <img
                src={item.imageUrl}
                alt={`${item.name} 이미지`}
                loading="lazy"
                onerror={(event) => handleImageError(event, item.id)}
              />
            {:else}
              <span class="image-empty">이미지 없음</span>
            {/if}
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
    --teal: var(--success);
    --rose: var(--danger);
    max-width: 1180px;
    margin: 0 auto;
    padding: 8px 0 36px;
    color: var(--text);
  }
  .search {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }

  .search label {
    display: grid;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }

  .search input {
    height: 44px;
    border: 1px solid var(--line);
    border-radius: var(--control-radius);
    padding: 0 13px;
    font-size: 14px;
    color: var(--ink);
    background: var(--surface);
  }

  .search input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }

  .result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 14px;
    color: var(--muted);
    font-size: 14px;
    font-weight: 700;
  }

  .result p {
    margin: 0;
  }

  .result button,
  .retry-button {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--control-radius);
    background: var(--surface-strong);
    color: var(--brand-strong);
    font-size: 0.78rem;
    font-weight: 800;
  }

  .status-panel {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 36px 20px;
    border: 1px solid var(--line);
    border-radius: var(--panel-radius);
    background: var(--surface);
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
    border-radius: var(--panel-radius);
    background: var(--surface);
    box-shadow: var(--shadow-soft);
    padding: 14px;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-card);
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
    font-size: 14px;
  }

  h2 {
    margin: 0;
    font-size: 24px;
    line-height: 1.1;
    color: var(--ink);
  }

  .photo-wrap {
    display: grid;
    margin-top: 10px;
    height: 176px;
    border: 1px solid var(--line);
    border-radius: var(--panel-radius-sm);
    background: var(--surface-muted);
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
    gap: 12px;
    margin-top: 10px;
    font-size: 14px;
  }

  .row strong {
    color: var(--muted);
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
    border: 1px solid var(--line);
    border-radius: var(--panel-radius-sm);
    background: var(--surface-muted);
    padding: 7px 6px;
    text-align: center;
  }

  .stat span {
    display: block;
    font-size: 12px;
    color: var(--muted);
    font-weight: 700;
  }

  .stat b {
    display: block;
    margin-top: 3px;
    font-size: 17px;
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
    height: 34px;
    border-radius: 999px;
    padding: 0 12px;
    font-size: 13px;
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
    font-weight: 600;
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

  }

  .image-empty {
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 700;
  }

  :global(html[data-theme="dark"]) .pokemon-page {
    color: var(--text);
  }

  :global(html[data-theme="dark"]) .pokemon-page h2,
  :global(html[data-theme="dark"]) .pokemon-page .row span,
  :global(html[data-theme="dark"]) .pokemon-page .stat b,
  :global(html[data-theme="dark"]) .pokemon-page .search input {
    color: var(--text-strong);
  }

  :global(html[data-theme="dark"]) .pokemon-page .result,
  :global(html[data-theme="dark"]) .pokemon-page .search label,
  :global(html[data-theme="dark"]) .pokemon-page .row strong,
  :global(html[data-theme="dark"]) .pokemon-page .stat span,
  :global(html[data-theme="dark"]) .pokemon-page .status,
  :global(html[data-theme="dark"]) .pokemon-page .dex {
    color: var(--muted);
  }

  :global(html[data-theme="dark"]) .pokemon-page .card {
    background: var(--surface);
    border-color: var(--line);
    box-shadow: var(--shadow-card);
  }

  :global(html[data-theme="dark"]) .pokemon-page .photo-wrap {
    background: var(--surface-muted);
    border-color: var(--line);
  }

  :global(html[data-theme="dark"]) .pokemon-page .search input,
  :global(html[data-theme="dark"]) .pokemon-page .stat {
    background: var(--surface-muted);
    border-color: var(--line);
  }

  :global(html[data-theme="dark"]) .pokemon-page .search input::placeholder {
    color: var(--muted);
  }

  :global(html[data-theme="dark"]) .pokemon-page .search input:focus {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px var(--focus-ring);
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
    background: var(--surface-muted);
    border-color: var(--line);
    color: var(--muted);
  }

  :global(html[data-theme="dark"]) .pokemon-page .status.error {
    color: #fca5a5;
  }
</style>
