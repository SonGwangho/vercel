<script lang="ts">
  import type { GameRankingBoard } from "$lib";

  let { data } = $props();

  const rankingBoards = $derived((data.rankingBoards ?? []) as GameRankingBoard[]);

  function formatScore(score: number): string {
    return Number(score).toLocaleString();
  }
</script>

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
          <p class="empty-state">랭킹 없음</p>
        {/if}
      </article>
    {/each}
  {:else}
    <p class="empty-state empty-full">표시할 랭킹이 없습니다.</p>
  {/if}
</section>

<style>
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

  :global(html[data-theme="dark"]) .ranking-block {
    border-color: rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.84);
  }

  :global(html[data-theme="dark"]) .ranking-list li {
    background: rgba(148, 163, 184, 0.12);
  }

  :global(html[data-theme="dark"]) .ranking-block h2,
  :global(html[data-theme="dark"]) .ranking-list strong {
    color: #e5eef8;
  }

  :global(html[data-theme="dark"]) .ranking-list span {
    color: #8ec5ff;
  }

  :global(html[data-theme="dark"]) .ranking-list b,
  :global(html[data-theme="dark"]) .empty-state {
    color: #a7b4c5;
  }

  @media (max-width: 640px) {
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
