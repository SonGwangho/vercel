<script lang="ts">
  import { onMount } from "svelte";

  import type {
    CurrentWeather,
    CurrentWeatherResponse,
    GameCodeListResponse,
    HomeRankingBoardState,
    RankingListResponse,
  } from "$lib";

  const HOME_RANKING_LIMIT = 5;
  const INITIAL_SKELETON_COUNT = 3;

  let weather = $state<CurrentWeather | null>(null);
  let weatherLoading = $state(true);
  let weatherError = $state(false);

  let rankingBoards = $state<HomeRankingBoardState[]>([]);
  let rankingsLoading = $state(true);

  function formatScore(score: number): string {
    return Number(score).toLocaleString();
  }

  function metricTone(status: string): string {
    if (status.includes("매우나쁨") || status.includes("매우 나쁨")) return "very-bad";
    if (status.includes("나쁨")) return "bad";
    if (status.includes("좋음")) return "good";
    return "normal";
  }

  function metricProgress(level: number): string {
    const progress = Math.min(100, Math.max(24, level * 25));
    return `--progress:${progress}%;`;
  }

  async function loadWeather() {
    weatherLoading = true;
    weatherError = false;

    try {
      const response = await fetch("/api/weather/current");

      if (!response.ok) {
        throw new Error("Failed to load weather.");
      }

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

    try {
      const codesResponse = await fetch("/api/games/codes");

      if (!codesResponse.ok) {
        throw new Error("Failed to load games.");
      }

      const codesData = (await codesResponse.json()) as GameCodeListResponse;
      const rankedGames = codesData.games.filter((game) => game.hasRanking);

      rankingBoards = rankedGames.map((game) => ({
        game,
        rankings: [],
        loading: true,
        error: false,
      }));
      rankingsLoading = false;

      await Promise.all(
        rankedGames.map(async (game) => {
          try {
            const rankingResponse = await fetch(
              `/api/rankings?gameCode=${game.gameCode}&limit=${HOME_RANKING_LIMIT}`,
            );

            if (!rankingResponse.ok) {
              throw new Error("Failed to load rankings.");
            }

            const rankingData = (await rankingResponse.json()) as RankingListResponse;
            rankingBoards = rankingBoards.map((board) =>
              board.game.gameCode === game.gameCode
                ? { ...board, rankings: rankingData.rankings, loading: false, error: false }
                : board,
            );
          } catch {
            rankingBoards = rankingBoards.map((board) =>
              board.game.gameCode === game.gameCode
                ? { ...board, rankings: [], loading: false, error: true }
                : board,
            );
          }
        }),
      );
    } catch {
      rankingBoards = [];
      rankingsLoading = false;
    }
  }

  onMount(() => {
    loadWeather();
    loadRankings();
  });

  const rankingSkeletons = $derived(
    Array.from({ length: INITIAL_SKELETON_COUNT }, (_, index) => index),
  );
</script>

<section class="home-weather-card">
  {#if weatherLoading}
    <div class="weather-panel weather-panel--loading">
      <div class="weather-main">
        <div class="weather-hero weather-hero--skeleton">
          <div class="skeleton skeleton-temp"></div>
          <div class="skeleton skeleton-feels"></div>
        </div>
        <div class="skeleton skeleton-summary"></div>
        <div class="weather-stats">
          <div class="weather-stat">
            <div class="skeleton skeleton-label"></div>
            <div class="skeleton skeleton-value"></div>
          </div>
          <div class="weather-stat weather-stat--divider">
            <div class="skeleton skeleton-label"></div>
            <div class="skeleton skeleton-value"></div>
          </div>
          <div class="weather-stat weather-stat--divider">
            <div class="skeleton skeleton-label"></div>
            <div class="skeleton skeleton-value"></div>
          </div>
        </div>
      </div>
      <div class="air-quality-grid">
        {#each [0, 1, 2] as item}
          <article class="air-card">
            <div class="air-ring air-ring--skeleton"></div>
            <div class="skeleton skeleton-air-title"></div>
            <div class="skeleton skeleton-air-status"></div>
          </article>
        {/each}
      </div>
    </div>
  {:else if weather}
    <div class="weather-panel">
      <div class="weather-main">
        <div class="weather-hero">
          <div class="weather-temp">{weather.temperature}</div>
          {#if weather.feelsLike}
            <div class="weather-feels">체감({weather.feelsLike})</div>
          {/if}
        </div>

        {#if weather.summary}
          <p class="weather-summary">{weather.summary}</p>
        {/if}

        <div class="weather-stats">
          {#if weather.humidity}
            <div class="weather-stat">
              <span class="weather-label">습도</span>
              <strong>{weather.humidity}</strong>
            </div>
          {/if}
          {#if weather.wind}
            <div class="weather-stat weather-stat--divider">
              <span class="weather-label">바람</span>
              <strong>{weather.wind}</strong>
            </div>
          {/if}
          {#if weather.precipitation}
            <div class="weather-stat weather-stat--divider">
              <span class="weather-label">1시간강수량</span>
              <strong>{weather.precipitation}</strong>
            </div>
          {/if}
        </div>
      </div>

      {#if weather.airQuality.length > 0}
        <div class="air-quality-grid">
          {#each weather.airQuality as metric}
            <article class={`air-card air-card--${metricTone(metric.status)}`} style={metricProgress(metric.level)}>
              <div class="air-ring">
                <div class="air-ring__inner">
                  <strong>{metric.value}</strong>
                  <span>{metric.unit}</span>
                </div>
              </div>
              <h3>{metric.label}</h3>
              <p>{metric.status}</p>
            </article>
          {/each}
        </div>
      {/if}

      {#if weather.airQualitySource}
        <p class="air-source">{weather.airQualitySource}</p>
      {/if}
    </div>
  {:else if weatherError}
    <div class="weather-panel weather-panel--empty">
      <p class="empty-state">날씨 정보를 불러오지 못했습니다.</p>
    </div>
  {/if}
</section>

<section class="home-ranking">
  {#if rankingsLoading && rankingBoards.length === 0}
    {#each rankingSkeletons as item}
      <article class="ranking-block ranking-block--loading">
        <div class="skeleton skeleton-title"></div>
        <div class="ranking-list ranking-list--loading">
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
          <div class="skeleton skeleton-row"></div>
        </div>
      </article>
    {/each}
  {:else if rankingBoards.length > 0}
    {#each rankingBoards as board}
      <article class="ranking-block">
        <h2>{board.game.name}</h2>

        {#if board.loading}
          <div class="ranking-list ranking-list--loading">
            <div class="skeleton skeleton-row"></div>
            <div class="skeleton skeleton-row"></div>
            <div class="skeleton skeleton-row"></div>
          </div>
        {:else if board.rankings.length > 0}
          <ol class="ranking-list">
            {#each board.rankings as ranking}
              <li>
                <span>{ranking.rank}</span>
                <strong>{ranking.userName}</strong>
                <b>{formatScore(ranking.score)}</b>
              </li>
            {/each}
          </ol>
        {:else if board.error}
          <p class="empty-state">랭킹 정보를 불러오지 못했습니다.</p>
        {:else}
          <p class="empty-state">랭킹 정보가 없습니다.</p>
        {/if}
      </article>
    {/each}
  {:else}
    <p class="empty-state empty-full">표시할 랭킹이 없습니다.</p>
  {/if}
</section>

<style>
  .home-weather-card {
    margin-bottom: 18px;
  }

  .weather-panel {
    padding: 28px 26px 24px;
    border: 1px solid rgba(15, 23, 42, 0.08);
    border-radius: 22px;
    background: #fff;
  }

  .weather-panel--loading,
  .ranking-block--loading {
    overflow: hidden;
  }

  .weather-panel--empty {
    display: grid;
    place-items: center;
    min-height: 180px;
  }

  .weather-main {
    display: grid;
    gap: 18px;
  }

  .weather-hero {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    text-align: center;
  }

  .weather-hero--skeleton {
    align-items: end;
  }

  .weather-temp {
    font-size: clamp(2.8rem, 5vw, 4rem);
    line-height: 1;
    font-weight: 800;
    color: #0f172a;
  }

  .weather-feels {
    font-size: clamp(1.3rem, 2vw, 1.8rem);
    font-weight: 700;
    color: #111827;
  }

  .weather-summary {
    margin: 0;
    text-align: center;
    font-size: 1.1rem;
    color: #111827;
  }

  .weather-summary :global(strong) {
    font-weight: 800;
  }

  .weather-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    text-align: center;
  }

  .weather-stat {
    display: grid;
    gap: 8px;
    padding: 0 12px;
  }

  .weather-stat--divider {
    border-left: 1px solid rgba(15, 23, 42, 0.16);
  }

  .weather-label {
    color: #0f172a;
    font-size: 1rem;
    font-weight: 600;
  }

  .weather-stat strong {
    color: #0f172a;
    font-size: 1.05rem;
  }

  .air-quality-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    margin-top: 28px;
  }

  .air-card {
    text-align: center;
    --tone: #94a3b8;
    --progress: 40%;
  }

  .air-card--very-bad {
    --tone: #c44739;
  }

  .air-card--bad {
    --tone: #f2a64f;
  }

  .air-card--good {
    --tone: #1ea6e8;
  }

  .air-card--normal {
    --tone: #94a3b8;
  }

  .air-ring {
    width: 96px;
    height: 96px;
    margin: 0 auto 14px;
    border-radius: 50%;
    background: conic-gradient(var(--tone) 0 var(--progress), rgba(191, 219, 254, 0.8) var(--progress) 100%);
    display: grid;
    place-items: center;
  }

  .air-ring--skeleton {
    background: linear-gradient(90deg, rgba(226, 232, 240, 0.8), rgba(241, 245, 249, 1), rgba(226, 232, 240, 0.8));
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite linear;
  }

  .air-ring__inner {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: white;
    display: grid;
    place-items: center;
    align-content: center;
    line-height: 1.05;
  }

  .air-ring__inner strong {
    font-size: 1.85rem;
    color: #0f172a;
  }

  .air-ring__inner span {
    font-size: 0.82rem;
    font-weight: 700;
    color: #0f172a;
  }

  .air-card h3 {
    margin: 0 0 6px;
    color: #0f172a;
    font-size: 1.05rem;
  }

  .air-card p {
    margin: 0;
    color: var(--tone);
    font-size: 1rem;
    font-weight: 700;
  }

  .air-source {
    margin: 16px 0 0;
    text-align: right;
    color: #334155;
    font-size: 0.94rem;
  }

  .home-ranking {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(clamp(240px, 26vw, 340px), 1fr));
    gap: 18px;
    align-items: start;
  }

  .ranking-block {
    padding: 20px 20px 18px;
    border: 1px solid rgba(17, 24, 39, 0.08);
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.92);
    min-width: 0;
    height: 100%;
  }

  .ranking-block h2 {
    margin: 0 0 14px;
    font-size: 1.05rem;
    line-height: 1.3;
  }

  .ranking-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  .ranking-list--loading {
    gap: 10px;
  }

  .ranking-list li {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(16, 57, 92, 0.06);
  }

  .ranking-list span {
    font-weight: 700;
    color: #10395c;
  }

  .ranking-list strong {
    color: #0f172a;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ranking-list b,
  .empty-state {
    color: #526071;
    font-size: 0.95rem;
  }

  .empty-state {
    margin: 0;
  }

  .empty-full {
    grid-column: 1 / -1;
  }

  .skeleton {
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(226, 232, 240, 0.8), rgba(241, 245, 249, 1), rgba(226, 232, 240, 0.8));
    background-size: 200% 100%;
    animation: shimmer 1.2s infinite linear;
  }

  .skeleton-temp {
    width: 140px;
    height: 56px;
  }

  .skeleton-feels {
    width: 110px;
    height: 30px;
  }

  .skeleton-summary {
    width: min(320px, 100%);
    height: 26px;
    margin: 0 auto;
  }

  .skeleton-label {
    width: 70px;
    height: 18px;
    margin: 0 auto;
  }

  .skeleton-value {
    width: 90px;
    height: 22px;
    margin: 0 auto;
  }

  .skeleton-air-title {
    width: 120px;
    height: 20px;
    margin: 0 auto 8px;
  }

  .skeleton-air-status {
    width: 70px;
    height: 20px;
    margin: 0 auto;
  }

  .skeleton-title {
    width: 55%;
    height: 24px;
    margin-bottom: 14px;
  }

  .skeleton-row {
    height: 46px;
    border-radius: 14px;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }

    100% {
      background-position: -200% 0;
    }
  }

  :global(html[data-theme="dark"]) .weather-panel,
  :global(html[data-theme="dark"]) .ranking-block {
    border-color: rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.9);
  }

  :global(html[data-theme="dark"]) .weather-temp,
  :global(html[data-theme="dark"]) .weather-feels,
  :global(html[data-theme="dark"]) .weather-summary,
  :global(html[data-theme="dark"]) .weather-label,
  :global(html[data-theme="dark"]) .weather-stat strong,
  :global(html[data-theme="dark"]) .air-ring__inner strong,
  :global(html[data-theme="dark"]) .air-ring__inner span,
  :global(html[data-theme="dark"]) .air-card h3,
  :global(html[data-theme="dark"]) .ranking-block h2,
  :global(html[data-theme="dark"]) .ranking-list strong {
    color: #e5eef8;
  }

  :global(html[data-theme="dark"]) .air-ring__inner {
    background: rgba(15, 23, 42, 0.96);
  }

  :global(html[data-theme="dark"]) .air-source,
  :global(html[data-theme="dark"]) .ranking-list b,
  :global(html[data-theme="dark"]) .empty-state {
    color: #a7b4c5;
  }

  :global(html[data-theme="dark"]) .ranking-list li {
    background: rgba(148, 163, 184, 0.12);
  }

  :global(html[data-theme="dark"]) .ranking-list span {
    color: #8ec5ff;
  }

  :global(html[data-theme="dark"]) .skeleton,
  :global(html[data-theme="dark"]) .air-ring--skeleton {
    background: linear-gradient(90deg, rgba(51, 65, 85, 0.88), rgba(71, 85, 105, 1), rgba(51, 65, 85, 0.88));
    background-size: 200% 100%;
  }

  @media (max-width: 720px) {
    .weather-panel {
      padding: 20px 16px 18px;
    }

    .weather-hero {
      flex-direction: column;
      gap: 10px;
    }

    .weather-stats {
      grid-template-columns: 1fr;
      gap: 14px;
    }

    .weather-stat,
    .weather-stat--divider {
      border-left: 0;
      padding: 0;
    }

    .air-quality-grid {
      grid-template-columns: 1fr;
      gap: 18px;
    }

    .home-ranking {
      grid-template-columns: 1fr;
      gap: 14px;
    }

    .ranking-block {
      padding: 16px;
      border-radius: 16px;
    }

    .ranking-block h2 {
      margin-bottom: 12px;
      font-size: 1rem;
    }

    .ranking-list {
      gap: 8px;
    }

    .ranking-list li {
      grid-template-columns: 28px minmax(0, 1fr) auto;
      gap: 10px;
      padding: 9px 10px;
      border-radius: 12px;
    }

    .ranking-list span,
    .ranking-list b,
    .ranking-list strong,
    .empty-state {
      font-size: 0.92rem;
    }

    .ranking-list strong {
      white-space: normal;
      word-break: break-word;
    }
  }
</style>