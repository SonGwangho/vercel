<script lang="ts">
  import type { TarotCard } from "$lib";
  import tarotCards from "$lib/assets/data/tarot/cards.json";

  type DrawMode = "upright" | "reversed";

  const cards = tarotCards as TarotCard[];
  const imageModules = import.meta.glob("$lib/assets/data/tarot/img/*.jpg", {
    eager: true,
    import: "default",
  }) as Record<string, string>;
  const imageUrlByFile = new Map(
    Object.entries(imageModules).map(([path, url]) => [
      path.split("/").pop() ?? "",
      url,
    ]),
  );
  const backImage = buildBackImage();

  let shuffledCards = $state(shuffleDeck(cards));
  let selectedCardId = $state<string | null>(null);
  let revealedIds = $state(new Set<string>());
  let drawModeByCardId = $state<Record<string, DrawMode>>({});

  const selectedCard = $derived(
    selectedCardId ? cards.find((card) => card.id === selectedCardId) ?? null : null,
  );
  const selectedDrawMode = $derived(
    selectedCardId ? (drawModeByCardId[selectedCardId] ?? "upright") : "upright",
  );

  const fortuneText = $derived(
    selectedCard
      ? selectedDrawMode === "upright"
        ? selectedCard.upright
        : selectedCard.reversed
      : "카드를 한 장 선택해 오늘의 메시지를 확인하세요.",
  );

  function shuffleDeck(source: TarotCard[]) {
    const deck = [...source];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function buildBackImage() {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="560" viewBox="0 0 360 560">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <pattern id="stars" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="8" cy="8" r="1.5" fill="#93c5fd" fill-opacity="0.55"/>
      <circle cx="24" cy="20" r="1.2" fill="#fde68a" fill-opacity="0.5"/>
      <circle cx="34" cy="10" r="1" fill="#e2e8f0" fill-opacity="0.42"/>
    </pattern>
  </defs>
  <rect width="360" height="560" rx="26" fill="url(#bg)"/>
  <rect x="18" y="18" width="324" height="524" rx="18" fill="none" stroke="#f8fafc" stroke-opacity="0.2" stroke-width="2"/>
  <rect x="30" y="30" width="300" height="500" rx="14" fill="url(#stars)" fill-opacity="0.5"/>
  <circle cx="180" cy="280" r="102" fill="none" stroke="#fbbf24" stroke-opacity="0.8" stroke-width="3"/>
  <circle cx="180" cy="280" r="68" fill="none" stroke="#e2e8f0" stroke-opacity="0.45" stroke-width="2"/>
  <text x="180" y="288" text-anchor="middle" fill="#f8fafc" font-size="42" font-family="Georgia, serif">TAROT</text>
</svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function frontImage(card: TarotCard) {
    return imageUrlByFile.get(card.imageFile) ?? backImage;
  }

  function pickCard(card: TarotCard) {
    selectedCardId = card.id;

    if (!revealedIds.has(card.id)) {
      const nextRevealed = new Set(revealedIds);
      nextRevealed.add(card.id);
      revealedIds = nextRevealed;

      drawModeByCardId = {
        ...drawModeByCardId,
        [card.id]: Math.random() > 0.5 ? "upright" : "reversed",
      };
    }
  }

  function pickRandom() {
    const card = shuffledCards[Math.floor(Math.random() * shuffledCards.length)];
    pickCard(card);
  }

  function reshuffle() {
    shuffledCards = shuffleDeck(cards);
    selectedCardId = null;
    revealedIds = new Set<string>();
    drawModeByCardId = {};
  }
</script>

<section class="tarot-page">
  <article class="live-result">
    <div class="live-info">
      <p class="live-label">현재 뽑은 카드</p>
      {#if selectedCard}
        <h2>
          #{selectedCard.majorNo} {selectedCard.koreanName} ({selectedCard.name})
        </h2>
        <p class={`direction ${selectedDrawMode}`}>
          {selectedDrawMode === "upright" ? "정방향 ↑" : "역방향 ↓"}
        </p>
      {:else}
        <h2>아직 카드를 뽑지 않았습니다</h2>
      {/if}
      <p class="fortune">{fortuneText}</p>
    </div>

    <div class="preview-wrap">
      {#if selectedCard}
        <img
          class={`preview-card ${selectedDrawMode === "reversed" ? "reversed" : ""}`}
          src={frontImage(selectedCard)}
          alt={`${selectedCard.koreanName} 카드`}
        />
      {:else}
        <img class="preview-card" src={backImage} alt="타로 카드 뒷면" />
      {/if}
    </div>
  </article>

  <div class="toolbar">
    <div class="toolbar-actions">
      <button type="button" class="shuffle-btn" onclick={reshuffle}>다시 셔플</button>
      <button type="button" class="random-btn" onclick={pickRandom}>랜덤 한 장 뽑기</button>
    </div>
    <p class="count">총 {cards.length}장</p>
  </div>

  <ul class="card-grid">
    {#each shuffledCards as card}
      {@const revealed = revealedIds.has(card.id)}
      {@const cardDrawMode = drawModeByCardId[card.id] ?? "upright"}
      <li>
        <button
          type="button"
          class={`deck-card ${selectedCardId === card.id ? "active" : ""}`}
          onclick={() => pickCard(card)}
          aria-pressed={selectedCardId === card.id}
        >
          <span class="card-no">#{card.majorNo}</span>
          <span class={`flip-inner ${revealed ? "revealed" : ""}`}>
            <span class="card-face card-back">
              <img src={backImage} alt="타로 카드 뒷면" loading="lazy" />
            </span>
            <span class={`card-face card-front ${revealed && cardDrawMode === "reversed" ? "reversed" : ""}`}>
              <img src={frontImage(card)} alt={`${card.koreanName} 카드`} loading="lazy" />
              {#if revealed}
                <b class={`card-direction ${cardDrawMode}`}>
                  {cardDrawMode === "upright" ? "정방향" : "역방향"}
                </b>
              {/if}
            </span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
</section>

<style>
  .tarot-page {
    max-width: 1100px;
    margin: 0 auto;
    padding: 14px 0 32px;
    color: #0f172a;
  }

  .live-result {
    margin-top: 12px;
    border: 1px solid #bfdbfe;
    border-radius: 14px;
    padding: 10px;
    background: linear-gradient(165deg, #ffffff 0%, #f8fafc 100%);
    display: grid;
    grid-template-columns: 1.5fr minmax(0, 150px);
    gap: 10px;
    align-items: center;
  }

  .live-label {
    margin: 0;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #0369a1;
    text-transform: uppercase;
  }

  .live-info h2 {
    margin: 4px 0 0;
    font-size: 22px;
    line-height: 1.08;
  }

  .direction {
    display: inline-flex;
    margin: 6px 0 0;
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 800;
  }

  .direction.upright {
    background: #dcfce7;
    color: #166534;
    border: 1px solid #86efac;
  }

  .direction.reversed {
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fca5a5;
  }

  .fortune {
    margin: 6px 0 0;
    font-size: 13px;
    color: #334155;
    line-height: 1.35;
  }

  .preview-wrap {
    display: grid;
    justify-items: end;
  }

  .preview-card {
    width: min(128px, 100%);
    border-radius: 10px;
    border: 1px solid #cbd5e1;
    box-shadow: 0 8px 16px rgba(15, 23, 42, 0.1);
    transform-origin: center;
    transition: transform 0.35s ease;
  }

  .preview-card.reversed {
    transform: rotate(180deg);
  }

  .toolbar {
    margin-top: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .shuffle-btn {
    border: 1px solid #94a3b8;
    height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: #fff;
    color: #1e293b;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .random-btn {
    border: none;
    height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: linear-gradient(135deg, #f59e0b 0%, #0ea5e9 100%);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .count {
    margin: 0;
    font-size: 13px;
    color: #475569;
    font-weight: 700;
  }

  .card-grid {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    justify-items: center;
  }

  .card-grid li {
    width: min(100%, 180px);
  }

  .deck-card {
    position: relative;
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 14px;
    background: transparent;
    padding: 0;
    cursor: pointer;
    transition:
      transform 0.16s ease,
      box-shadow 0.16s ease,
      border-color 0.16s ease;
    perspective: 1200px;
    overflow: hidden;
  }

  .deck-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 26px rgba(15, 23, 42, 0.12);
  }

  .deck-card.active {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.16);
  }

  .card-no {
    position: absolute;
    right: 8px;
    top: 8px;
    z-index: 3;
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 800;
    background: rgba(255, 255, 255, 0.95);
    color: #0f172a;
    border: 1px solid #cbd5e1;
  }

  .flip-inner {
    position: relative;
    display: block;
    transform-style: preserve-3d;
    transition: transform 0.45s ease;
  }

  .flip-inner.revealed {
    transform: rotateY(180deg);
  }

  .card-face {
    display: block;
    backface-visibility: hidden;
  }

  .card-face img {
    width: 100%;
    aspect-ratio: 9 / 14;
    object-fit: contain;
    display: block;
    background: #0f172a;
    padding: 6px;
    box-sizing: border-box;
    border-radius: 8px;
  }

  .card-front {
    position: absolute;
    inset: 0;
    transform: rotateY(180deg);
  }

  .card-front.reversed img {
    transform: rotate(180deg);
  }

  .card-direction {
    position: absolute;
    left: 8px;
    top: 8px;
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 800;
    border: 1px solid transparent;
    background: #fff;
  }

  .card-direction.upright {
    color: #166534;
    border-color: #86efac;
    background: rgba(220, 252, 231, 0.95);
  }

  .card-direction.reversed {
    color: #991b1b;
    border-color: #fca5a5;
    background: rgba(254, 226, 226, 0.95);
  }

  @media (max-width: 980px) {
    .live-result {
      grid-template-columns: 1fr;
    }

    .preview-wrap {
      justify-items: start;
    }

    .card-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .card-grid li {
      width: min(100%, 170px);
    }
  }

  @media (max-width: 720px) {
    .live-info h2 {
      font-size: 19px;
    }

    .toolbar {
      align-items: flex-start;
      flex-direction: column;
    }

    .toolbar-actions {
      width: 100%;
    }

    .shuffle-btn,
    .random-btn {
      flex: 1;
    }

    .card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .card-grid li {
      width: min(100%, 160px);
    }
  }
</style>
