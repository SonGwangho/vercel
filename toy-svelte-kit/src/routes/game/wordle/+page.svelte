<script lang="ts">
  import { onMount } from "svelte";

  type LetterState = "empty" | "absent" | "present" | "correct";
  type GameState = "playing" | "won" | "lost";

  const WORD_LENGTH = 5;
  const MAX_TRIES = 6;
  const KEY_ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
  ];
  const WORD_BANK = [
    "apple",
    "beach",
    "brain",
    "bread",
    "brick",
    "chair",
    "chess",
    "cloud",
    "crane",
    "dream",
    "drink",
    "earth",
    "flame",
    "frame",
    "fresh",
    "fruit",
    "ghost",
    "globe",
    "grape",
    "green",
    "happy",
    "honey",
    "light",
    "lemon",
    "lunch",
    "metal",
    "mouse",
    "night",
    "ocean",
    "pearl",
    "piano",
    "plant",
    "quick",
    "river",
    "robot",
    "smile",
    "sound",
    "stone",
    "sugar",
    "table",
    "tiger",
    "train",
    "water",
    "world",
    "youth",
    "zebra",
  ] as const;
  const WORD_SET = new Set(WORD_BANK);
  const LETTER_RANK: Record<LetterState, number> = {
    empty: 0,
    absent: 1,
    present: 2,
    correct: 3,
  };

  let answer = $state("");
  let guesses = $state<string[]>([]);
  let results = $state<LetterState[][]>([]);
  let currentGuess = $state("");
  let gameState = $state<GameState>("playing");
  let message = $state("Guess the hidden 5-letter word.");
  let keyStates = $state<Record<string, LetterState>>({});
  const triesUsed = $derived(guesses.length);
  const triesLeft = $derived(Math.max(0, MAX_TRIES - triesUsed));
  const statusLabel = $derived(
    gameState === "won" ? "Solved" : gameState === "lost" ? "Failed" : "Playing",
  );

  function pickAnswer() {
    const randomWord = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
    return randomWord.toUpperCase();
  }

  function evaluateGuess(guess: string, target: string): LetterState[] {
    const output: LetterState[] = Array(WORD_LENGTH).fill("absent");
    const chars = target.split("");
    const counts: Record<string, number> = {};

    for (const char of chars) {
      counts[char] = (counts[char] ?? 0) + 1;
    }

    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guess[i] === target[i]) {
        output[i] = "correct";
        counts[guess[i]] -= 1;
      }
    }

    for (let i = 0; i < WORD_LENGTH; i++) {
      if (output[i] === "correct") {
        continue;
      }

      const letter = guess[i];

      if ((counts[letter] ?? 0) > 0) {
        output[i] = "present";
        counts[letter] -= 1;
      } else {
        output[i] = "absent";
      }
    }

    return output;
  }

  function applyKeyState(guess: string, state: LetterState[]) {
    const next = { ...keyStates };

    for (let i = 0; i < WORD_LENGTH; i++) {
      const letter = guess[i];
      const incoming = state[i];
      const current = next[letter] ?? "empty";

      if (LETTER_RANK[incoming] > LETTER_RANK[current]) {
        next[letter] = incoming;
      }
    }

    keyStates = next;
  }

  function startNewGame() {
    answer = pickAnswer();
    guesses = [];
    results = [];
    currentGuess = "";
    gameState = "playing";
    keyStates = {};
    message = "Guess the hidden 5-letter word.";
  }

  function submitGuess() {
    if (gameState !== "playing") {
      return;
    }

    if (currentGuess.length < WORD_LENGTH) {
      message = "Not enough letters.";
      return;
    }

    const normalized = currentGuess.toLowerCase();

    if (!WORD_SET.has(normalized as (typeof WORD_BANK)[number])) {
      message = "Word not in list.";
      return;
    }

    const guess = currentGuess.toUpperCase();
    const state = evaluateGuess(guess, answer);

    guesses = [...guesses, guess];
    results = [...results, state];
    applyKeyState(guess, state);
    currentGuess = "";

    if (guess === answer) {
      gameState = "won";
      message = "Great job! You solved it.";
      return;
    }

    if (guesses.length >= MAX_TRIES) {
      gameState = "lost";
      message = `Game over. Answer: ${answer}`;
      return;
    }

    message = `${MAX_TRIES - guesses.length} tries left.`;
  }

  function handleInput(rawKey: string) {
    const key = rawKey.toUpperCase();

    if (gameState !== "playing") {
      return;
    }

    if (key === "ENTER") {
      submitGuess();
      return;
    }

    if (key === "BACKSPACE" || key === "BACK") {
      currentGuess = currentGuess.slice(0, -1);
      return;
    }

    if (/^[A-Z]$/.test(key) && currentGuess.length < WORD_LENGTH) {
      currentGuess += key;
    }
  }

  function tileLetter(rowIndex: number, colIndex: number) {
    if (rowIndex < guesses.length) {
      return guesses[rowIndex][colIndex] ?? "";
    }

    if (rowIndex === guesses.length) {
      return currentGuess[colIndex] ?? "";
    }

    return "";
  }

  function tileState(rowIndex: number, colIndex: number): LetterState {
    if (rowIndex < results.length) {
      return results[rowIndex][colIndex] ?? "empty";
    }

    return "empty";
  }

  onMount(() => {
    startNewGame();

    const onKeyDown = (event: KeyboardEvent) => {
      handleInput(event.key);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
</script>

<section class="wordle-page">
  <div class="wordle-panel">
    <div class="wordle-head">
      <div>
        <p class="eyebrow">Daily Style Puzzle</p>
        <h1>Wordle</h1>
      </div>
      <div class="meta">
        <span class="chip">{statusLabel}</span>
        <span class="chip">Left {triesLeft}</span>
      </div>
    </div>

    <p class="message">{message}</p>

    <div class="board" aria-label="Wordle board">
      {#each Array(MAX_TRIES) as _, rowIndex}
        <div class="row">
          {#each Array(WORD_LENGTH) as _, colIndex}
            {@const letter = tileLetter(rowIndex, colIndex)}
            {@const state = tileState(rowIndex, colIndex)}
            <div
              class={`tile ${state} ${rowIndex === guesses.length && letter ? "typed" : ""}`}
            >
              {letter}
            </div>
          {/each}
        </div>
      {/each}
    </div>

    <div class="keyboard" aria-label="Word keyboard">
      {#each KEY_ROWS as row}
        <div class="key-row">
          {#each row as key}
            {@const visual = key === "BACK" ? "DEL" : key}
            <button
              type="button"
              class={`key ${key.length > 1 ? "wide" : ""} ${keyStates[key] ?? "empty"}`}
              onclick={() => handleInput(key)}
              disabled={gameState !== "playing"}
            >
              {visual}
            </button>
          {/each}
        </div>
      {/each}
    </div>

    {#if gameState !== "playing"}
      <button type="button" class="restart" onclick={startNewGame}>Start New Round</button>
    {/if}
  </div>
</section>

<style>
  .wordle-page {
    --surface: rgba(255, 255, 255, 0.86);
    --border: rgba(148, 163, 184, 0.3);
    --shadow: 0 20px 60px rgba(15, 23, 42, 0.12);
    --absent: #6b7280;
    --present: #d97706;
    --correct: #15803d;
    max-width: 680px;
    margin: 0 auto;
    padding: 16px 0 28px;
    position: relative;
  }

  .wordle-page::before {
    content: "";
    position: absolute;
    inset: -20px 0 auto;
    height: 180px;
    background: radial-gradient(circle at 20% 10%, #dbeafe 0%, transparent 50%),
      radial-gradient(circle at 80% 0%, #dcfce7 0%, transparent 48%);
    z-index: -1;
    pointer-events: none;
  }

  .wordle-panel {
    border: 1px solid var(--border);
    border-radius: 24px;
    background: var(--surface);
    box-shadow: var(--shadow);
    backdrop-filter: blur(10px);
    padding: 18px;
  }

  .wordle-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .eyebrow {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
  }

  .wordle-head h1 {
    margin: 0;
    font-size: 34px;
    line-height: 1.05;
    letter-spacing: -0.02em;
  }

  .meta {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: #fff;
    color: #334155;
    font-size: 12px;
    font-weight: 700;
  }

  .message {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 14px;
  }

  .board {
    margin-top: 16px;
    display: grid;
    gap: 7px;
  }

  .row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 7px;
  }

  .tile {
    height: 62px;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    display: grid;
    place-items: center;
    font-size: 30px;
    font-weight: 800;
    letter-spacing: 0.04em;
    background: #fff;
    color: #0f172a;
    transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
  }

  .tile.typed {
    border-color: #94a3b8;
    transform: translateY(-1px);
  }

  .tile.absent {
    background: var(--absent);
    border-color: var(--absent);
    color: #fff;
  }

  .tile.present {
    background: var(--present);
    border-color: var(--present);
    color: #fff;
  }

  .tile.correct {
    background: var(--correct);
    border-color: var(--correct);
    color: #fff;
  }

  .keyboard {
    margin-top: 18px;
    display: grid;
    gap: 7px;
  }

  .key-row {
    display: grid;
    grid-template-columns: repeat(20, minmax(0, 1fr));
    gap: 6px;
  }

  .key {
    grid-column: span 2;
    height: 46px;
    border: 1px solid transparent;
    border-radius: 10px;
    font-weight: 700;
    background: #e5e7eb;
    color: #0f172a;
    cursor: pointer;
    transition: transform 0.12s ease, filter 0.12s ease, background-color 0.2s ease;
  }

  .key:hover:enabled {
    filter: brightness(0.98);
    transform: translateY(-1px);
  }

  .key.wide {
    grid-column: span 4;
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .key.absent {
    background: var(--absent);
    color: #fff;
  }

  .key.present {
    background: var(--present);
    color: #fff;
  }

  .key.correct {
    background: var(--correct);
    color: #fff;
  }

  .key:disabled {
    opacity: 0.78;
    cursor: default;
  }

  .restart {
    margin-top: 14px;
    width: 100%;
    height: 46px;
    border: none;
    border-radius: 12px;
    font-weight: 700;
    background: linear-gradient(135deg, #1d4ed8 0%, #0f766e 100%);
    color: #fff;
    cursor: pointer;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.2);
  }

  @media (max-width: 640px) {
    .wordle-page {
      max-width: 560px;
    }

    .wordle-panel {
      border-radius: 18px;
      padding: 14px;
    }

    .wordle-head h1 {
      font-size: 28px;
    }

    .message {
      font-size: 13px;
    }

    .tile {
      height: 54px;
      font-size: 25px;
    }

    .key {
      height: 40px;
      font-size: 12px;
    }
  }
</style>
