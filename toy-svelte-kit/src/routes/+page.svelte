<script lang="ts">
  import type {
    AirQualityMetric,
    CurrentWeather,
    GameRankingBoard,
  } from "$lib";

  let {
    data,
  }: {
    data: {
      weather?: CurrentWeather | null;
      rankingBoards?: GameRankingBoard[];
    };
  } = $props();

  const weather = $derived((data.weather ?? null) as CurrentWeather | null);
  const rankingBoards = $derived(
    (data.rankingBoards ?? []) as GameRankingBoard[],
  );

  function formatScore(score: number): string {
    return Number(score).toLocaleString();
  }

  function metricTone(metric: AirQualityMetric): string {
    if (
      metric.status.includes("매우나쁨") ||
      metric.status.includes("매우 나쁨")
    ) {
      return "very-bad";
    }

    if (metric.status.includes("나쁨")) {
      return "bad";
    }

    if (metric.status.includes("좋음")) {
      return "good";
    }

    return "normal";
  }

  function metricProgress(metric: AirQualityMetric): string {
    const progress = Math.min(100, Math.max(24, metric.level * 25));
    return `--progress:${progress}%;`;
  }
</script>

{#if weather}
  <section class="home-weather-card">
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
            <article
              class={`air-card air-card--${metricTone(metric)}`}
              style={metricProgress(metric)}
            >
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
  </section>
{/if}

<section class="home-ranking">
  {#if rankingBoards.length > 0}
    {#each rankingBoards as board}
      <article class="ranking-block">
        <h2>{board.game.name}</h2>

        {#if board.rankings.length > 0}
          <ol class="ranking-list">
            {#each board.rankings as ranking}
              <li>
                <span>{ranking.rank}</span>
                <strong>{ranking.userName}</strong>
                <b>{formatScore(ranking.score)}</b>
              </li>
            {/each}
          </ol>
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

  .sun-row {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    flex-wrap: wrap;
    color: #111827;
    font-size: 1rem;
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
    background: conic-gradient(
      var(--tone) 0 var(--progress),
      rgba(191, 219, 254, 0.8) var(--progress) 100%
    );
    display: grid;
    place-items: center;
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
    grid-template-columns: repeat(
      auto-fit,
      minmax(clamp(240px, 26vw, 340px), 1fr)
    );
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
  :global(html[data-theme="dark"]) .sun-row,
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

    .sun-row {
      justify-content: flex-start;
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
