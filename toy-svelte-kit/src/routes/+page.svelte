<script lang="ts">
  import { onMount } from "svelte";
  import type { CurrentWeather, CurrentWeatherResponse, HomeRankingBoardState } from "$lib";
  import { loadRankingBoards } from "$lib";

  const HOME_RANKING_LIMIT = 5;
  const INITIAL_SKELETON_COUNT = 3;

  let weather = $state<CurrentWeather | null>(null);
  let weatherLoading = $state(true);
  let weatherError = $state(false);
  let rankingBoards = $state<HomeRankingBoardState[]>([]);
  let rankingsLoading = $state(true);
  let rankingsError = $state(false);

  const isRefreshing = $derived(weatherLoading || rankingsLoading);
  const rankingSkeletons = Array.from({ length: INITIAL_SKELETON_COUNT }, (_, index) => index);

  function formatScore(score: number): string {
    return Number(score).toLocaleString("ko-KR");
  }

  function metricTone(status: string): string {
    if (status.includes("매우나쁨") || status.includes("매우 나쁨")) return "very-bad";
    if (status.includes("나쁨")) return "bad";
    if (status.includes("좋음")) return "good";
    return "normal";
  }

  async function loadWeather() {
    weatherLoading = true;
    weatherError = false;
    try {
      const response = await fetch("/api/weather/current");
      if (!response.ok) throw new Error("Failed to load weather.");
      const payload = (await response.json()) as CurrentWeatherResponse;
      weather = payload.weather;
    } catch {
      weather = null;
      weatherError = true;
    } finally {
      weatherLoading = false;
    }
  }

  async function loadRankings() {
    rankingsLoading = true;
    rankingsError = false;
    try {
      const data = await loadRankingBoards(HOME_RANKING_LIMIT);
      rankingBoards = data.boards.map((board) => ({ ...board, loading: false, error: false }));
    } catch {
      rankingBoards = [];
      rankingsError = true;
    } finally {
      rankingsLoading = false;
    }
  }

  async function refreshDashboard() {
    await Promise.all([loadWeather(), loadRankings()]);
  }

  onMount(() => { void refreshDashboard(); });
</script>

<svelte:head>
  <title>장난감 웹 · 홈</title>
  <meta name="description" content="오늘의 날씨를 확인하고 게임에서 새로운 기록에 도전해 보세요." />
</svelte:head>

{#snippet arrowIcon()}
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </svg>
{/snippet}

<div class="home-dashboard">
  <header class="dashboard-heading">
    <div>
      <h1>오늘의 장난감 웹</h1>
      <p>날씨를 살펴보고, 새로운 기록에 도전해 보세요.</p>
    </div>
    <button type="button" class="refresh-button" onclick={() => void refreshDashboard()} disabled={isRefreshing} aria-label={isRefreshing ? "홈 정보 불러오는 중" : "홈 정보 새로고침"} aria-busy={isRefreshing}>
      <svg class:refreshing={isRefreshing} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 7a7 7 0 0 1 11.55-1.4L20 8M4 16l2.35 2.4A7 7 0 0 0 17.9 17" />
      </svg>
      <span>{isRefreshing ? "불러오는 중" : "새로고침"}</span>
    </button>
  </header>

  <section class="home-section" aria-labelledby="weather-heading" aria-busy={weatherLoading}>
    <header class="section-heading">
      <h2 id="weather-heading">현재 날씨</h2>
      {#if weather?.locationName}
        <span class="location-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" />
          </svg>
          {weather.locationName}
        </span>
      {/if}
    </header>

    {#if weatherLoading && !weather}
      <p class="sr-only" role="status">날씨 정보를 불러오는 중입니다.</p>
      <div class="weather-grid" aria-hidden="true">
        <div class="weather-panel">
          <div class="skeleton skeleton-temperature"></div>
          <div class="skeleton skeleton-summary"></div>
          <div class="weather-stats">
            {#each [0, 1, 2] as item}
              <div class="weather-stat"><div class="skeleton skeleton-label"></div><div class="skeleton skeleton-value"></div></div>
            {/each}
          </div>
        </div>
        <div class="air-panel">
          <h3>대기질</h3>
          <div class="air-quality-grid">
            {#each [0, 1, 2] as item}
              <div class="air-metric"><div class="skeleton skeleton-label"></div><div class="skeleton skeleton-air-value"></div><div class="skeleton skeleton-label"></div></div>
            {/each}
          </div>
        </div>
      </div>
    {:else if weather}
      <div class="weather-grid">
        <div class="weather-panel">
          <div class="weather-hero">
            <span class="weather-temperature">{weather.temperature}</span>
            {#if weather.feelsLike}<span class="weather-feels">체감 {weather.feelsLike}</span>{/if}
          </div>
          {#if weather.summary}<p class="weather-summary">{weather.summary}</p>{/if}
          <dl class="weather-stats">
            <div class="weather-stat"><dt>습도</dt><dd>{weather.humidity ?? "—"}</dd></div>
            <div class="weather-stat"><dt>바람</dt><dd>{weather.wind ?? "—"}</dd></div>
            <div class="weather-stat"><dt>1시간 강수량</dt><dd>{weather.precipitation ?? "—"}</dd></div>
          </dl>
          {#if weather.alert}<p class="weather-alert">{weather.alert}</p>{/if}
        </div>
        <div class="air-panel">
          <h3>대기질</h3>
          {#if weather.airQuality.length > 0}
            <div class="air-quality-grid">
              {#each weather.airQuality as metric (metric.key)}
                <article class={`air-metric air-metric--${metricTone(metric.status)}`}>
                  <h4>{metric.label}</h4>
                  <p class="air-value">{metric.value}<span>{metric.unit}</span></p>
                  <p class="air-status"><span aria-hidden="true"></span>{metric.status}</p>
                </article>
              {/each}
            </div>
          {:else}
            <p class="empty-state">대기질 정보가 없습니다.</p>
          {/if}
          {#if weather.airQualitySource}<p class="air-source">{weather.airQualitySource}</p>{/if}
        </div>
      </div>
    {:else}
      <div class="state-panel" role="status">
        <div>
          <h3>{weatherError ? "날씨 정보를 불러오지 못했습니다." : "표시할 날씨 정보가 없습니다."}</h3>
          <p>잠시 후 다시 시도해 주세요.</p>
        </div>
        <button type="button" class="inline-action" onclick={() => void loadWeather()} disabled={weatherLoading}>다시 시도 {@render arrowIcon()}</button>
      </div>
    {/if}
  </section>

  <section class="home-section" aria-labelledby="ranking-heading" aria-busy={rankingsLoading}>
    <header class="section-heading">
      <div><h2 id="ranking-heading">게임 랭킹</h2><p>최고 기록에 도전해 보세요.</p></div>
      {#if rankingBoards.length > 0}<span class="section-note">게임별 상위 {HOME_RANKING_LIMIT}명</span>{/if}
    </header>
    <div class="home-ranking">
      {#if rankingsLoading && rankingBoards.length === 0}
        <p class="sr-only" role="status">게임 랭킹을 불러오는 중입니다.</p>
        {#each rankingSkeletons as item}
          <article class="ranking-block" aria-hidden="true">
            <div class="skeleton skeleton-title"></div>
            <div class="ranking-skeletons">{#each [0, 1, 2] as row}<div class="skeleton skeleton-row"></div>{/each}</div>
          </article>
        {/each}
      {:else if rankingsError}
        <div class="state-panel" role="alert">
          <div><h3>랭킹 정보를 불러오지 못했습니다.</h3><p>잠시 후 다시 시도해 주세요.</p></div>
          <button type="button" class="inline-action" onclick={() => void loadRankings()} disabled={rankingsLoading}>다시 시도 {@render arrowIcon()}</button>
        </div>
      {:else if rankingBoards.length > 0}
        {#each rankingBoards as board (board.game.id)}
          <article class="ranking-block">
            <header class="ranking-heading"><h3><a href={board.game.path}>{board.game.name}</a></h3></header>
            {#if board.loading}
              <div class="ranking-skeletons" aria-hidden="true">{#each [0, 1, 2] as row}<div class="skeleton skeleton-row"></div>{/each}</div>
            {:else if board.rankings.length > 0}
              <div class="ranking-labels" aria-hidden="true"><span>순위</span><span>플레이어</span><span>점수</span></div>
              <ol class="ranking-list">
                {#each board.rankings as ranking}
                  <li class:ranking-first={ranking.rank === 1}>
                    <span class="ranking-position" aria-label={`${ranking.rank}위`}>{ranking.rank}</span>
                    <span class="ranking-name" title={ranking.userName}>{ranking.userName}</span>
                    <strong class="ranking-score">{formatScore(ranking.score)}</strong>
                  </li>
                {/each}
              </ol>
            {:else if board.error}
              <p class="empty-state">랭킹 정보를 불러오지 못했습니다.</p>
            {:else}
              <div class="ranking-empty"><p>아직 등록된 기록이 없어요.</p><span>첫 번째 기록의 주인공이 되어 보세요.</span></div>
            {/if}
            <a class="play-link" href={board.game.path} aria-label={`${board.game.name} 플레이하기`}>플레이하기 {@render arrowIcon()}</a>
          </article>
        {/each}
      {:else}
        <div class="state-panel"><p class="empty-state">표시할 랭킹이 없습니다.</p></div>
      {/if}
    </div>
  </section>
</div>

<style>
  /* 1100px canvas: 12 × 77px columns + 11 × 16px gutters. Weather spans 5 + 7. */
  .home-dashboard { display: grid; gap: 36px; }
  .dashboard-heading { display: flex; justify-content: space-between; align-items: center; gap: 24px; }
  .dashboard-heading h1 { margin: 0; color: var(--text-strong); font-size: 32px; font-weight: 700; line-height: 1.35; letter-spacing: -0.03em; }
  .dashboard-heading p { margin: 10px 0 0; color: var(--muted); font-size: 15px; }
  .refresh-button, .inline-action { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px; border: 1px solid var(--line-strong); border-radius: var(--control-radius); background: transparent; color: var(--text); font-size: 13px; font-weight: 600; text-decoration: none; white-space: nowrap; transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease; }
  .refresh-button svg, .inline-action svg, .play-link svg { width: 17px; height: 17px; flex: 0 0 auto; }
  .refresh-button:hover, .inline-action:hover { background: var(--surface-strong); border-color: var(--muted); }
  .refresh-button:active, .inline-action:active { transform: translateY(1px); }
  .refresh-button:disabled, .inline-action:disabled { cursor: wait; color: var(--muted); border-color: var(--line); }
  .refreshing { animation: rotate 1.2s linear infinite; }
  .home-section { display: grid; gap: 16px; min-width: 0; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .section-heading h2 { margin: 0; color: var(--text-strong); font-size: 18px; font-weight: 650; line-height: 1.4; letter-spacing: -0.02em; }
  .section-heading p { margin: 5px 0 0; color: var(--muted); font-size: 13px; }
  .location-label, .section-note { color: var(--muted); font-size: 12px; }
  .location-label { display: inline-flex; align-items: center; justify-content: flex-end; gap: 5px; min-width: 0; }
  .location-label svg { width: 15px; height: 15px; flex: 0 0 auto; }
  .section-note { flex: 0 0 auto; }
  .weather-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; }
  .weather-panel, .air-panel { padding: 28px; border-radius: var(--panel-radius); background: var(--surface); min-width: 0; }
  .weather-panel { grid-column: span 5; }
  .air-panel { grid-column: span 7; display: flex; flex-direction: column; gap: 20px; }
  .weather-hero { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 16px; }
  .weather-temperature { color: var(--brand-strong); font-family: var(--font-numeric); font-size: 44px; font-weight: 400; line-height: 1.2; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
  .weather-feels { color: var(--muted); font-size: 13px; }
  .weather-summary { margin: 8px 0 0; color: var(--text); font-size: 14px; }
  .weather-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 24px 0 0; }
  .weather-stat { display: grid; align-content: start; gap: 6px; min-width: 0; }
  .weather-stat dt { color: var(--muted); font-size: 12px; }
  .weather-stat dd { margin: 0; color: var(--text); font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .weather-alert { margin: 16px 0 0; color: var(--danger); font-size: 13px; }
  .air-panel h3 { margin: 0; font-size: 14px; font-weight: 600; }
  .air-quality-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
  .air-metric { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; --metric-color: var(--muted); }
  .air-metric--good { --metric-color: var(--success); }
  .air-metric--bad { --metric-color: var(--accent-warm); }
  .air-metric--very-bad { --metric-color: var(--danger); }
  .air-metric h4 { margin: 0; color: var(--muted); font-size: 12px; font-weight: 500; line-height: 1.5; min-height: 36px; }
  .air-value { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px; margin: 0; color: var(--text-strong); font-family: var(--font-numeric); font-size: 26px; font-weight: 400; font-variant-numeric: tabular-nums; line-height: 1.35; overflow-wrap: anywhere; }
  .air-value span { color: var(--muted); font-size: 11px; }
  .air-status { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--metric-color); font-size: 12px; font-weight: 500; }
  .air-status > span { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex: 0 0 auto; }
  .air-source { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.6; }
  .home-ranking { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 16px; align-items: stretch; }
  .ranking-block { display: flex; flex-direction: column; gap: 16px; min-width: 0; padding: 24px; border-radius: var(--panel-radius); background: var(--surface); }
  .ranking-heading h3 { margin: 0; font-size: 16px; font-weight: 650; line-height: 1.4; letter-spacing: -0.015em; }
  .ranking-heading a { color: var(--text-strong); text-decoration: none; }
  .ranking-heading a:hover { color: var(--brand-strong); }
  .ranking-labels, .ranking-list li { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .ranking-labels { color: var(--muted); font-size: 11px; }
  .ranking-labels span:last-child { text-align: right; }
  .ranking-list { list-style: none; display: grid; gap: 4px; margin: -8px 0 0; padding: 0; }
  .ranking-list li { min-height: 40px; font-size: 13px; }
  .ranking-position { color: var(--muted); font-variant-numeric: tabular-nums; }
  .ranking-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
  .ranking-score { color: var(--text-strong); font-family: var(--font-numeric); font-weight: 500; font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; max-width: 112px; }
  .ranking-first .ranking-position, .ranking-first .ranking-score { color: var(--brand-strong); }
  .ranking-empty { display: grid; gap: 6px; padding-block: 4px; }
  .ranking-empty p { margin: 0; font-size: 13px; color: var(--text); }
  .ranking-empty span { font-size: 12px; line-height: 1.6; color: var(--muted); }
  .play-link { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; margin: auto -8px -8px; padding: 8px; border-radius: var(--control-radius); color: var(--brand-strong); font-size: 13px; font-weight: 600; text-decoration: none; transition: background-color 0.18s ease; }
  .play-link:hover { background: var(--brand-soft); }
  .play-link:active { background: var(--surface-strong); }
  .state-panel { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 28px; border-radius: var(--panel-radius); background: var(--surface); }
  .state-panel h3 { margin: 0; color: var(--text); font-size: 15px; font-weight: 600; }
  .state-panel p { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
  .empty-state { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
  .skeleton { background: var(--surface-strong); border-radius: 5px; animation: pulse 1.6s ease-in-out infinite; }
  .skeleton-temperature { width: 148px; height: 53px; }
  .skeleton-summary { width: 62%; height: 20px; margin-top: 8px; }
  .skeleton-label { width: 70%; max-width: 90px; height: 16px; }
  .skeleton-value { width: 80%; max-width: 76px; height: 20px; }
  .skeleton-air-value { width: 70%; max-width: 76px; height: 35px; }
  .skeleton-title { width: 45%; height: 22px; }
  .ranking-skeletons { display: grid; gap: 8px; }
  .skeleton-row { height: 40px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; padding: 0; margin: -1px; clip-path: inset(50%); white-space: nowrap; border: 0; }
  @keyframes pulse { 50% { opacity: 0.45; } }
  @keyframes rotate { to { transform: rotate(360deg); } }
  @media (max-width: 900px) {
    .weather-panel { grid-column: span 6; }
    .air-panel { grid-column: span 6; }
    .weather-panel, .air-panel { padding: 24px; }
    .air-quality-grid { gap: 12px; }
    .air-value { font-size: 22px; }
  }
  @media (max-width: 720px) {
    .home-dashboard { gap: 28px; }
    .dashboard-heading { align-items: flex-start; gap: 16px; }
    .dashboard-heading h1 { font-size: 26px; }
    .dashboard-heading p { font-size: 13px; max-width: 28ch; margin-top: 8px; }
    .refresh-button { width: 44px; padding: 0; flex: 0 0 auto; }
    .refresh-button span { display: none; }
    .weather-panel, .air-panel { grid-column: 1 / -1; padding: 24px; }
    .weather-temperature { font-size: 40px; }
    .weather-stats { margin-top: 20px; }
    .air-panel { gap: 16px; }
    .air-quality-grid { gap: 16px; }
    .air-value { font-size: 24px; }
    .air-metric h4 { min-height: 36px; }
    .ranking-block { padding: 24px; }
    .state-panel { align-items: flex-start; flex-direction: column; gap: 16px; padding: 24px; }
    .state-panel .inline-action { align-self: flex-start; }
    .section-heading h2 { font-size: 17px; }
  }
  @media (max-width: 380px) {
    .weather-panel, .air-panel, .ranking-block { padding: 20px; }
    .air-quality-grid { gap: 12px; }
    .air-value { font-size: 22px; }
    .air-value span { width: 100%; }
    .weather-stats { gap: 12px; }
  }
</style>
