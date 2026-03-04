<script lang="ts">
  import type { PokemonKoCache, PokemonKoItem } from "$lib";
  import { startGlobalLoading, stopGlobalLoading } from "$lib/stores/loading";
  import { Storage } from "$lib/utils/Storage";
  import { onMount } from "svelte";

  const STORAGE_KEY = "pokemon:ko:detail:v5";
  const POKEAPI_BASE = "https://pokeapi.co/api/v2";
  const MAX_CONCURRENCY = 20;
  const PAGE_SIZE = 24;
  const OFFICIAL_ARTWORK_BASE =
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork";

  let memoryCache: PokemonKoCache | null = null;
  let inFlight: Promise<PokemonKoCache> | null = null;

  type NamedApiResource = {
    name: string;
    url: string;
  };

  type SpeciesListResponse = {
    count: number;
    results: NamedApiResource[];
  };

  type SpeciesDetailResponse = {
    id: number;
    name: string;
    names: Array<{
      name: string;
      language: { name: string };
    }>;
    generation: NamedApiResource;
    evolves_from_species: NamedApiResource | null;
    evolution_chain: { url: string };
  };

  type PokemonDetailResponse = {
    types: Array<{
      slot: number;
      type: NamedApiResource;
    }>;
    stats: Array<{
      base_stat: number;
      stat: { name: string };
    }>;
    abilities: Array<{
      ability: NamedApiResource;
    }>;
    sprites: {
      other?: {
        home?: { front_default?: string | null };
        "official-artwork"?: { front_default?: string | null };
      };
      front_default?: string | null;
    };
  };

  type EvolutionChainResponse = {
    chain: EvolutionNode;
  };

  type EvolutionNode = {
    species: NamedApiResource;
    evolves_to: EvolutionNode[];
  };

  let loading = $state(true);
  let fromCache = $state(false);
  let errorMessage = $state("");
  let items = $state<PokemonKoItem[]>([]);
  let fetchedAtLabel = $state("");
  let searchName = $state("");
  let searchDexNo = $state("");
  let visibleCount = $state(PAGE_SIZE);
  let sentinelEl = $state<HTMLDivElement | null>(null);

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

  function formatDateTime(timestamp: number) {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp));
  }

  function generationToKoLabel(apiName: string) {
    const table: Record<string, string> = {
      "generation-i": "1세대",
      "generation-ii": "2세대",
      "generation-iii": "3세대",
      "generation-iv": "4세대",
      "generation-v": "5세대",
      "generation-vi": "6세대",
      "generation-vii": "7세대",
      "generation-viii": "8세대",
      "generation-ix": "9세대",
    };
    return table[apiName] ?? apiName;
  }

  function buildArtworkFallback(id: number) {
    return `${OFFICIAL_ARTWORK_BASE}/${id}.png`;
  }

  async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`fetch failed: ${res.status} ${url}`);
    }
    return (await res.json()) as T;
  }

  async function mapWithConcurrency<T, R>(
    list: T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(list.length);
    let index = 0;

    async function worker() {
      while (index < list.length) {
        const current = index++;
        results[current] = await mapper(list[current], current);
      }
    }

    const workerCount = Math.min(limit, Math.max(1, list.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  async function fetchKoNameByResource(
    resource: NamedApiResource,
    cache: Map<string, string>,
  ) {
    const cached = cache.get(resource.url);
    if (cached) {
      return cached;
    }

    const detail = await fetchJson<{
      names?: Array<{
        name: string;
        language: { name: string };
      }>;
      name?: string;
    }>(resource.url);

    const koName =
      detail.names?.find((entry) => entry.language.name === "ko")?.name ??
      detail.name ??
      resource.name;

    cache.set(resource.url, koName);
    return koName;
  }

  function collectEvolutionLinks(
    node: EvolutionNode,
    prevBySpecies: Map<string, string>,
    nextBySpecies: Map<string, string[]>,
  ) {
    const current = node.species.name;
    const children = node.evolves_to.map((entry) => entry.species.name);
    nextBySpecies.set(current, children);

    for (const child of node.evolves_to) {
      prevBySpecies.set(child.species.name, current);
      collectEvolutionLinks(child, prevBySpecies, nextBySpecies);
    }
  }

  function readStat(
    stats: PokemonDetailResponse["stats"],
    key: string,
    fallback = 0,
  ) {
    return (
      stats.find((entry) => entry.stat.name === key)?.base_stat ?? fallback
    );
  }

  function selectLatestSprite(
    sprites: PokemonDetailResponse["sprites"],
    id: number,
  ) {
    return (
      sprites.other?.home?.front_default ??
      sprites.other?.["official-artwork"]?.front_default ??
      sprites.front_default ??
      buildArtworkFallback(id)
    );
  }

  function applyNameFilter(name: string) {
    searchName = name;
    searchDexNo = "";
  }

  async function buildPokemonKoData(): Promise<PokemonKoItem[]> {
    const first = await fetchJson<SpeciesListResponse>(
      `${POKEAPI_BASE}/pokemon-species?limit=1&offset=0`,
    );

    const speciesList = await fetchJson<SpeciesListResponse>(
      `${POKEAPI_BASE}/pokemon-species?limit=${first.count}&offset=0`,
    );

    const nameCache = new Map<string, string>();
    const speciesDetails = await mapWithConcurrency(
      speciesList.results,
      MAX_CONCURRENCY,
      (resource) => fetchJson<SpeciesDetailResponse>(resource.url),
    );

    const koNameBySpeciesName = new Map<string, string>();
    for (const species of speciesDetails) {
      const koName =
        species.names.find((entry) => entry.language.name === "ko")?.name ??
        species.name;
      koNameBySpeciesName.set(species.name, koName);
    }

    const uniqueEvolutionUrls = [
      ...new Set(speciesDetails.map((species) => species.evolution_chain.url)),
    ];

    const prevBySpecies = new Map<string, string>();
    const nextBySpecies = new Map<string, string[]>();

    const evolutionChains = await mapWithConcurrency(
      uniqueEvolutionUrls,
      MAX_CONCURRENCY,
      (url) => fetchJson<EvolutionChainResponse>(url),
    );

    for (const chain of evolutionChains) {
      collectEvolutionLinks(chain.chain, prevBySpecies, nextBySpecies);
    }

    const pokemonDetails = await mapWithConcurrency(
      speciesDetails,
      MAX_CONCURRENCY,
      (species) =>
        fetchJson<PokemonDetailResponse>(
          `${POKEAPI_BASE}/pokemon/${species.id}`,
        ),
    );

    const pokemonById = new Map<number, PokemonDetailResponse>();
    for (let i = 0; i < speciesDetails.length; i++) {
      pokemonById.set(speciesDetails[i].id, pokemonDetails[i]);
    }

    const itemsWithNull = await mapWithConcurrency(
      speciesDetails,
      MAX_CONCURRENCY,
      async (species) => {
        const pokemon = pokemonById.get(species.id);
        if (!pokemon) {
          return null;
        }

        const hp = readStat(pokemon.stats, "hp");
        const attack = readStat(pokemon.stats, "attack");
        const defense = readStat(pokemon.stats, "defense");
        const specialAttack = readStat(pokemon.stats, "special-attack");
        const specialDefense = readStat(pokemon.stats, "special-defense");
        const speed = readStat(pokemon.stats, "speed");

        const types = await Promise.all(
          [...pokemon.types]
            .sort((a, b) => a.slot - b.slot)
            .map((entry) => fetchKoNameByResource(entry.type, nameCache)),
        );

        const abilitySet = new Set(
          await Promise.all(
            pokemon.abilities.map((entry) =>
              fetchKoNameByResource(entry.ability, nameCache),
            ),
          ),
        );

        const previousSpeciesName =
          species.evolves_from_species?.name ??
          prevBySpecies.get(species.name) ??
          null;
        const previousKoName = previousSpeciesName
          ? (koNameBySpeciesName.get(previousSpeciesName) ??
            previousSpeciesName)
          : null;

        const nextSpeciesNames = nextBySpecies.get(species.name) ?? [];
        const nextKoNames = nextSpeciesNames.map(
          (name) => koNameBySpeciesName.get(name) ?? name,
        );

        return {
          id: species.id,
          name: koNameBySpeciesName.get(species.name) ?? species.name,
          imageUrl: selectLatestSprite(pokemon.sprites, species.id),
          types,
          baseStats: {
            hp,
            attack,
            defense,
            specialAttack,
            specialDefense,
            speed,
            total:
              hp + attack + defense + specialAttack + specialDefense + speed,
          },
          evolution: {
            from: previousKoName,
            to: nextKoNames,
          },
          generation: generationToKoLabel(species.generation.name),
          abilities: [...abilitySet].sort((a, b) =>
            a.localeCompare(b, "ko-KR"),
          ),
        } satisfies PokemonKoItem;
      },
    );

    const cleaned = itemsWithNull.flatMap((item) => (item ? [item] : []));
    return cleaned.sort((a, b) => a.id - b.id);
  }

  async function getOrBuildPokemonCache(): Promise<{
    payload: PokemonKoCache;
    fromCache: boolean;
  }> {
    if (memoryCache && memoryCache.items.length > 0) {
      return { payload: memoryCache, fromCache: true };
    }

    const saved = await Storage.get<PokemonKoCache>(STORAGE_KEY);
    if (saved && saved.items.length > 0) {
      memoryCache = saved;
      return { payload: saved, fromCache: true };
    }

    if (!inFlight) {
      inFlight = (async () => {
        const built = await buildPokemonKoData();
        const payload: PokemonKoCache = {
          fetchedAt: Date.now(),
          items: built,
        };
        await Storage.set(STORAGE_KEY, payload);
        memoryCache = payload;
        return payload;
      })().finally(() => {
        inFlight = null;
      });
    }

    const payload = await inFlight;
    return { payload, fromCache: false };
  }

  async function loadPokemon() {
    loading = true;
    errorMessage = "";
    startGlobalLoading("포켓몬 정보를 불러오는 중입니다...");

    try {
      const { payload, fromCache: cacheHit } = await getOrBuildPokemonCache();
      fromCache = cacheHit;
      items = payload.items;
      fetchedAtLabel = formatDateTime(payload.fetchedAt);
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "포켓몬 데이터를 불러오지 못했습니다.";
    } finally {
      stopGlobalLoading();
      loading = false;
    }
  }

  onMount(() => {
    loadPokemon();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMore();
          }
        }
      },
      { root: null, rootMargin: "280px 0px", threshold: 0 },
    );

    if (sentinelEl) {
      observer.observe(sentinelEl);
    }

    return () => observer.disconnect();
  });
</script>

<section class="pokemon-page">
  <div class="hero">
    <p class="eyebrow">Pokemon Explorer</p>
    <h1>Pokebook</h1>
    {#if !loading && !errorMessage}
      <p class="meta">
        {fromCache ? "캐시 사용" : "API 조회 후 저장"} | {items.length}마리 | {fetchedAtLabel}
      </p>
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
            <img
              src={item.imageUrl ?? buildArtworkFallback(item.id)}
              alt={`${item.name} 이미지`}
              loading="lazy"
            />
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
            <div class="stat">
              <span>공격</span><b>{item.baseStats.attack}</b>
            </div>
            <div class="stat">
              <span>특수공격</span><b>{item.baseStats.specialAttack}</b>
            </div>
            <div class="stat">
              <span>방어</span><b>{item.baseStats.defense}</b>
            </div>
            <div class="stat">
              <span>특수방어</span><b>{item.baseStats.specialDefense}</b>
            </div>
            <div class="stat">
              <span>스피드</span><b>{item.baseStats.speed}</b>
            </div>
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
              <button type="button" class="evo-btn evolve" disabled
                >진화 없음</button
              >
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
      <p class="status">스크롤해서 더 불러오세요.</p>
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
</style>
