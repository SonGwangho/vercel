<script lang="ts">
	import { onMount } from "svelte";

	import { Storage, type LottoLatestResponse, type LottoLine, type LottoSheet } from "$lib";

	const LABEL_LATEST = "\uCD5C\uADFC \uCD94\uCCA8 \uACB0\uACFC";
	const LABEL_FIRST_PRIZE = "1\uB4F1 \uB2F9\uCCA8\uAE08";
	const LABEL_EOK_WON = "\uC5B5 \uC6D0";
	const LABEL_WINNERS = "\uBA85";
	const LABEL_PICKER_TITLE = "\uB85C\uB610 \uBC88\uD638 \uC120\uD0DD\uAE30";
	const LABEL_CURRENT_LINE = "\uD604\uC7AC \uC120\uD0DD \uC911";
	const LABEL_COMPLETE = "\uC120\uD0DD\uC644\uB8CC";
	const LABEL_SAVE = "\uC800\uC7A5";
	const LABEL_RESET = "\uCD08\uAE30\uD654";
	const LABEL_SAVED_SHEETS = "\uC800\uC7A5\uB41C \uB85C\uB610 \uD55C \uC7A5";
	const LABEL_NO_SHEET = "\uC800\uC7A5\uB41C \uB85C\uB610 \uD55C \uC7A5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.";
	const LABEL_VIEW_SHEET = "\uC7A5 \uBC88\uD638 \uBCF4\uAE30";
	const LABEL_SHEET_SUFFIX = "\uBC88 \uC7A5";
	const LABEL_ROUND_SUFFIX = "\uD68C";
	const LABEL_SAVE_OK = "\uB2E4\uC74C \uD68C\uCC28\uC6A9 \uB85C\uB610 \uD55C \uC7A5\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.";
	const LABEL_MAX_LINES = "\uD55C \uC7A5\uC740 \uCD5C\uB300 5\uC904\uAE4C\uC9C0\uB9CC \uC120\uD0DD\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
	const LABEL_NOTHING_TO_SAVE = "\uC800\uC7A5\uD560 \uC120\uD0DD\uC644\uB8CC \uBC88\uD638\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
	const LABEL_DRAFT_EMPTY = "\uC120\uD0DD\uC644\uB8CC\uD55C \uC904\uC774 \uC5EC\uAE30\uC5D0 \uC313\uC785\uB2C8\uB2E4.";
	const STORAGE_KEY = "lotto-sheets";
	const MAX_LINES_PER_SHEET = 5;
	const LOTTO_NUMBERS = Array.from({ length: 45 }, (_, index) => index + 1);

	let loading = $state(true);
	let errorMessage = $state("");
	let latest = $state<LottoLatestResponse["latest"] | null>(null);
	let currentSelection = $state<number[]>([]);
	let draftLines = $state<LottoLine[]>([]);
	let savedSheets = $state<LottoSheet[]>([]);
	let selectedSheetId = $state<string | null>(null);
	let pickerMessage = $state("");

	const nextRound = $derived(latest ? latest.round + 1 : null);
	const selectedSheet = $derived(savedSheets.find((sheet) => sheet.id === selectedSheetId) ?? null);

	function ballTone(number: number) {
		if (number <= 10) {
			return "tone-0";
		}

		if (number <= 20) {
			return "tone-1";
		}

		if (number <= 30) {
			return "tone-2";
		}

		if (number <= 40) {
			return "tone-3";
		}

		return "tone-4";
	}

	function createId() {
		return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	}

	function sortNumbers(numbers: number[]) {
		return [...numbers].sort((left, right) => left - right);
	}

	function pickRandomNumbers(count: number, excluded: number[]) {
		const pool = LOTTO_NUMBERS.filter((number) => !excluded.includes(number));
		const picked: number[] = [];

		while (picked.length < count && pool.length > 0) {
			const index = Math.floor(Math.random() * pool.length);
			const [number] = pool.splice(index, 1);
			if (number !== undefined) {
				picked.push(number);
			}
		}

		return picked;
	}

	function toggleNumber(number: number) {
		pickerMessage = "";

		if (currentSelection.includes(number)) {
			currentSelection = currentSelection.filter((value) => value !== number);
			return;
		}

		if (currentSelection.length >= 6) {
			return;
		}

		currentSelection = sortNumbers([...currentSelection, number]);
	}

	function completeLine() {
		pickerMessage = "";

		if (draftLines.length >= MAX_LINES_PER_SHEET) {
			pickerMessage = LABEL_MAX_LINES;
			return;
		}

		const autoPicked = pickRandomNumbers(6 - currentSelection.length, currentSelection);
		const numbers = sortNumbers([...currentSelection, ...autoPicked]);

		draftLines = [...draftLines, { id: createId(), numbers }];
		currentSelection = [];
	}

	function removeDraftLine(lineId: string) {
		draftLines = draftLines.filter((line) => line.id !== lineId);
	}

	function resetDraft() {
		currentSelection = [];
		draftLines = [];
		pickerMessage = "";
	}

	function pruneExpiredSheets(sheets: LottoSheet[], activeRound: number) {
		return sheets.filter((sheet) => Math.abs(sheet.targetRound - activeRound) < 2);
	}

	function toPlainLine(line: LottoLine): LottoLine {
		return {
			id: line.id,
			numbers: [...line.numbers]
		};
	}

	function toPlainSheet(sheet: LottoSheet): LottoSheet {
		return {
			id: sheet.id,
			targetRound: sheet.targetRound,
			lines: sheet.lines.map(toPlainLine),
			createdAt: sheet.createdAt
		};
	}

	async function syncSavedSheets(activeRound: number) {
		const stored = (await Storage.get<LottoSheet[]>(STORAGE_KEY)) ?? [];
		const pruned = pruneExpiredSheets(stored, activeRound).sort((left, right) =>
			right.createdAt.localeCompare(left.createdAt)
		);

		savedSheets = pruned;

		if (pruned.length !== stored.length) {
			await Storage.remove(STORAGE_KEY);
			if (pruned.length > 0) {
				await Storage.set(STORAGE_KEY, pruned);
			}
		}

		if (!pruned.some((sheet) => sheet.id === selectedSheetId)) {
			selectedSheetId = pruned[0]?.id ?? null;
		}
	}

	async function saveSheet() {
		pickerMessage = "";

		if (!nextRound) {
			return;
		}

		if (draftLines.length === 0) {
			pickerMessage = LABEL_NOTHING_TO_SAVE;
			return;
		}

		try {
			const stored = (await Storage.get<LottoSheet[]>(STORAGE_KEY)) ?? [];
			const pruned = pruneExpiredSheets(stored, nextRound).map(toPlainSheet);
			const nextSheet: LottoSheet = {
				id: createId(),
				targetRound: nextRound,
				lines: draftLines.map(toPlainLine),
				createdAt: new Date().toISOString()
			};
			const nextSheets = [nextSheet, ...pruned].sort((left, right) =>
				right.createdAt.localeCompare(left.createdAt)
			);

			await Storage.set(STORAGE_KEY, nextSheets);

			savedSheets = nextSheets;
			selectedSheetId = nextSheet.id;
			draftLines = [];
			currentSelection = [];
			pickerMessage = LABEL_SAVE_OK;
		} catch (error) {
			pickerMessage =
				error instanceof Error ? error.message : "Failed to save the lotto sheet.";
		}
	}

	async function loadLottoResult() {
		loading = true;
		errorMessage = "";

		try {
			const response = await fetch("/api/lotto");
			const data = (await response.json()) as LottoLatestResponse & { message?: string };

			if (!response.ok) {
				throw new Error(data.message || "Failed to load the latest lotto result.");
			}

			latest = data.latest;
			await syncSavedSheets(data.latest.round + 1);
		} catch (error) {
			latest = null;
			errorMessage =
				error instanceof Error ? error.message : "Failed to load the latest lotto result.";
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadLottoResult();
	});
</script>

<section class="lotto-page">
	{#if loading}
		<div class="panel status-panel">
			<p>Loading the latest lotto result.</p>
		</div>
	{:else if errorMessage}
		<div class="panel status-panel error">
			<p>{errorMessage}</p>
		</div>
	{:else if latest}
		<div class="panel result-panel">
			<div class="result-card">
				<p class="section-label">{LABEL_LATEST}</p>
				<div class="round-row">
					<strong>{latest.roundLabel}</strong>
					<span>{latest.drawDateLabel}</span>
				</div>

				<div class="numbers-block">
					<div class="numbers-row">
						<div class="main-numbers">
							{#each latest.numbers as number}
								<div class={`ball ${ballTone(number)}`}>{number}</div>
							{/each}
						</div>

						<div class="plus">+</div>

						<div class={`ball bonus ${ballTone(latest.bonusNumber)}`}>
							{latest.bonusNumber}
						</div>
					</div>
				</div>

				<div class="prize-block">
					<div class="prize-label">{LABEL_FIRST_PRIZE}</div>
					<div class="prize-total">{latest.firstPrizeTotalAmountEok}{LABEL_EOK_WON}</div>
					<div class="prize-detail">
						({latest.firstPrizeAmountEok}{LABEL_EOK_WON} × {latest.firstPrizeWinnerCount}{LABEL_WINNERS})
					</div>
				</div>
			</div>
		</div>

		<div class="panel picker-panel">
			<div class="picker-card">
				<h2>{LABEL_PICKER_TITLE}</h2>

				<div class="picker-workspace">
					<div class="picker-left">
						<div class="selection-preview">
							<div class="preview-head">
								<span>{LABEL_CURRENT_LINE}</span>
								<span>{currentSelection.length}/6</span>
							</div>
							<div class="preview-balls">
								{#each currentSelection as number}
									<button
										type="button"
										class={`ball preview-ball ${ballTone(number)}`}
										onclick={() => toggleNumber(number)}
									>
										{number}
									</button>
								{/each}
								{#each Array.from({ length: Math.max(0, 6 - currentSelection.length) }) as _, index}
									<div class="ball empty-ball" aria-hidden="true">{index + currentSelection.length + 1}</div>
								{/each}
							</div>
						</div>

						<div class="number-grid">
							{#each LOTTO_NUMBERS as number}
								<button
									type="button"
									class={`number-chip ${ballTone(number)} ${currentSelection.includes(number) ? "active" : ""}`}
									onclick={() => toggleNumber(number)}
									aria-pressed={currentSelection.includes(number)}
								>
									{number}
								</button>
							{/each}
						</div>

						<div class="picker-actions">
							<button
								type="button"
								class="action-btn secondary"
								onclick={resetDraft}
								disabled={draftLines.length === 0 && currentSelection.length === 0}
							>
								{LABEL_RESET}
							</button>
							<button
								type="button"
								class="action-btn primary"
								onclick={completeLine}
								disabled={draftLines.length >= MAX_LINES_PER_SHEET}
							>
								{LABEL_COMPLETE}
							</button>
							<button
								type="button"
								class="action-btn save"
								onclick={() => void saveSheet()}
								disabled={draftLines.length === 0}
							>
								{LABEL_SAVE}
							</button>
						</div>

						{#if pickerMessage}
							<p class="picker-message">{pickerMessage}</p>
						{/if}
					</div>

					<div class="picker-right">
						<div class="draft-lines">
							{#if draftLines.length > 0}
								{#each draftLines as line, index}
									<div class="draft-line">
										<div class="draft-line-head">
											<div class="draft-line-spacer"></div>
											<button
												type="button"
												class="remove-btn"
												onclick={() => removeDraftLine(line.id)}
												aria-label="Remove line"
											>
												<span>X</span>
											</button>
										</div>
										<div class="draft-line-balls">
											{#each line.numbers as number}
												<div class={`mini-ball ${ballTone(number)}`}>{number}</div>
											{/each}
										</div>
									</div>
								{/each}
							{:else}
								<div class="draft-empty">{LABEL_DRAFT_EMPTY}</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="panel saved-panel">
			<div class="saved-card">
				<div class="saved-header">
					<div>
						<p class="saved-kicker">{LABEL_SAVED_SHEETS}</p>
						<h2>Saved Sheets</h2>
					</div>
				</div>

				{#if savedSheets.length === 0}
					<p class="saved-empty">{LABEL_NO_SHEET}</p>
				{:else}
					<div class="saved-sheet-list">
						{#each savedSheets as sheet, index}
							<button
								type="button"
								class={`sheet-tab ${sheet.id === selectedSheetId ? "active" : ""}`}
								onclick={() => (selectedSheetId = sheet.id)}
							>
								<span>{index + 1}{LABEL_SHEET_SUFFIX}</span>
								<small>{sheet.targetRound}{LABEL_ROUND_SUFFIX}</small>
							</button>
						{/each}
					</div>

					{#if selectedSheet}
						<div class="sheet-detail">
							<div class="sheet-detail-head">
								<strong>{selectedSheet.targetRound}{LABEL_ROUND_SUFFIX} {LABEL_VIEW_SHEET}</strong>
								<span>{selectedSheet.lines.length} lines</span>
							</div>

								<div class="sheet-lines">
									{#each selectedSheet.lines as line}
										<div class="sheet-line">
											<div class="sheet-line-balls">
												{#each line.numbers as number}
													<div class={`mini-ball ${ballTone(number)}`}>{number}</div>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.lotto-page {
		--lotto-ink: #171717;
		max-width: 1040px;
		margin: 0 auto;
		padding: 8px 0 36px;
		color: var(--lotto-ink);
	}

	.panel {
		margin-top: 12px;
		border-radius: 24px;
		border: 1px solid rgba(226, 232, 240, 0.9);
		background: #fff;
		box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
	}

	.status-panel {
		padding: 24px 20px;
		font-size: 15px;
		font-weight: 700;
		color: #3f3f46;
	}

	.status-panel.error {
		color: #b91c1c;
		border-color: rgba(248, 113, 113, 0.35);
		background: rgba(254, 242, 242, 0.96);
	}

	.result-panel,
	.picker-panel,
	.saved-panel {
		padding: 18px;
	}

	.result-card,
	.picker-card,
	.saved-card {
		padding: 20px;
		border-radius: 20px;
		background: #fff;
	}

	.result-card {
		text-align: center;
	}

	.section-label {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		color: #64748b;
	}

	.round-row {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}

	.round-row strong {
		font-size: clamp(34px, 6vw, 48px);
		line-height: 1.05;
		letter-spacing: -0.04em;
		color: #020617;
		font-weight: 900;
	}

	.round-row span {
		font-size: 16px;
		font-weight: 500;
		color: #475569;
	}

	.numbers-block {
		margin-top: 28px;
	}

	.numbers-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
	}

	.main-numbers {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.ball {
		display: grid;
		place-items: center;
		width: 62px;
		height: 62px;
		border-radius: 999px;
		font-size: 20px;
		font-weight: 900;
		color: #fff;
		border: none;
	}

	.tone-0 {
		background: #f4c430;
		color: #5b3d00;
	}

	.tone-1 {
		background: #1d6fd1;
	}

	.tone-2 {
		background: #e94b6a;
	}

	.tone-3 {
		background: #7a869a;
	}

	.tone-4 {
		background: #39a845;
	}

	.plus {
		font-size: 42px;
		font-weight: 400;
		color: #9ca3af;
		line-height: 1;
	}

	.prize-block {
		margin-top: 54px;
		text-align: center;
	}

	.prize-label {
		font-size: 18px;
		font-weight: 700;
		color: #475569;
	}

	.prize-total {
		margin-top: 10px;
		font-size: clamp(40px, 7vw, 58px);
		line-height: 1;
		font-weight: 900;
		letter-spacing: -0.04em;
		color: #020617;
	}

	.prize-detail {
		margin-top: 14px;
		font-size: 18px;
		font-weight: 700;
		color: #020617;
	}

	h2 {
		margin: 0;
		font-size: 28px;
		line-height: 1.05;
		letter-spacing: -0.03em;
		color: #020617;
	}

	.picker-workspace {
		display: grid;
		grid-template-columns: minmax(0, 1.02fr) minmax(360px, 1fr);
		gap: 16px;
		margin-top: 18px;
		align-items: start;
	}

	.selection-preview {
		padding: 18px;
		border-radius: 20px;
		background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
		border: 1px solid #dbe5f1;
	}

	.preview-head,
	.draft-line-head,
	.saved-header,
	.sheet-detail-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.preview-head span {
		font-size: 14px;
		font-weight: 800;
		color: #334155;
	}

	.preview-balls {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 14px;
	}

	.preview-ball {
		cursor: pointer;
	}

	.empty-ball {
		background: #dbe4ef;
		color: #8aa0bc;
	}

	.number-grid {
		display: grid;
		grid-template-columns: repeat(9, minmax(0, 1fr));
		gap: 10px;
		margin-top: 14px;
	}

	.number-chip {
		height: 48px;
		border-radius: 10px;
		border: none;
		font-size: 16px;
		font-weight: 900;
		color: #fff;
		cursor: pointer;
		opacity: 0.62;
		transition:
			transform 0.14s ease,
			opacity 0.14s ease,
			box-shadow 0.14s ease;
	}

	.number-chip.active {
		opacity: 1;
		transform: translateY(-1px);
		box-shadow: 0 10px 18px rgba(15, 23, 42, 0.14);
	}

	.number-chip:hover {
		opacity: 0.92;
	}

	.picker-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 18px;
	}

	.action-btn {
		height: 44px;
		padding: 0 18px;
		border-radius: 999px;
		font-size: 14px;
		font-weight: 800;
		cursor: pointer;
		border: none;
	}

	.action-btn.secondary {
		background: #dbe4ef;
		color: #334155;
	}

	.action-btn.primary {
		background: #16867b;
		color: #fff;
	}

	.action-btn.save {
		background: #ef2d2d;
		color: #fff;
	}

	.action-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.picker-message {
		margin: 10px 0 0;
		font-size: 14px;
		font-weight: 700;
		color: #0f766e;
	}

	.draft-lines {
		display: grid;
		gap: 12px;
	}

	.draft-line {
		padding: 14px 16px;
		border-radius: 18px;
		background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
		border: 1px solid #dbe5f1;
	}

	.sheet-detail-head strong {
		font-size: 15px;
		color: #0f172a;
	}

	.remove-btn {
		display: inline-grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 999px;
		background: #ef2d2d;
		color: #fff;
		font-size: 13px;
		font-weight: 900;
		cursor: pointer;
		padding: 0;
	}

	.remove-btn span {
		line-height: 1;
		transform: translateY(-0.5px);
	}

	.draft-line-spacer {
		width: 28px;
		height: 28px;
	}

	.draft-line-balls,
	.sheet-line-balls {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 12px;
	}

	.mini-ball {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border-radius: 999px;
		font-size: 13px;
		font-weight: 900;
		color: #fff;
	}

	.draft-empty {
		display: grid;
		place-items: center;
		min-height: 220px;
		padding: 20px;
		border-radius: 18px;
		border: 1px dashed #cbd5e1;
		background: #f8fafc;
		font-size: 14px;
		font-weight: 700;
		color: #64748b;
		text-align: center;
	}

	.saved-kicker {
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 800;
		color: #475569;
	}

	.saved-empty {
		margin: 16px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: #475569;
	}

	.saved-sheet-list {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 18px;
	}

	.sheet-tab {
		display: grid;
		gap: 2px;
		min-width: 110px;
		padding: 12px 14px;
		border-radius: 16px;
		border: 1px solid #e2e8f0;
		background: #fff;
		text-align: left;
		cursor: pointer;
	}

	.sheet-tab.active {
		border-color: #16867b;
		background: #f0fdfa;
		box-shadow: 0 10px 18px rgba(15, 118, 110, 0.1);
	}

	.sheet-tab span {
		font-size: 14px;
		font-weight: 800;
		color: #0f172a;
	}

	.sheet-tab small,
	.sheet-detail-head span {
		font-size: 13px;
		font-weight: 700;
		color: #64748b;
	}

	.sheet-detail {
		margin-top: 18px;
		padding: 16px;
		border-radius: 20px;
		background: #f8fafc;
		border: 1px solid #e2e8f0;
	}

	.sheet-lines {
		display: grid;
		gap: 12px;
		margin-top: 16px;
	}

	.sheet-line {
		padding: 14px;
		border-radius: 18px;
		background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
		border: 1px solid #dbe5f1;
	}

	@media (max-width: 980px) {
		.picker-workspace {
			grid-template-columns: minmax(0, 1fr);
		}

		.number-grid {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
	}

	@media (max-width: 720px) {
		.result-panel,
		.picker-panel,
		.saved-panel {
			padding: 12px;
		}

		.numbers-row {
			flex-wrap: wrap;
		}

		.ball {
			width: 50px;
			height: 50px;
			font-size: 19px;
		}

		.plus {
			font-size: 32px;
		}

		.prize-block {
			margin-top: 40px;
		}

		.prize-detail {
			font-size: 16px;
		}

		.preview-head,
		.draft-line-head,
		.saved-header,
		.sheet-detail-head {
			flex-direction: column;
		}

		.number-grid {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}

		.number-chip {
			height: 44px;
		}
	}

	:global(html[data-theme="dark"]) .lotto-page .panel,
	:global(html[data-theme="dark"]) .lotto-page .result-card,
	:global(html[data-theme="dark"]) .lotto-page .picker-card,
	:global(html[data-theme="dark"]) .lotto-page .saved-card {
		background: #1c1917;
		border-color: rgba(255, 255, 255, 0.08);
	}

	:global(html[data-theme="dark"]) .lotto-page .section-label,
	:global(html[data-theme="dark"]) .lotto-page .round-row span,
	:global(html[data-theme="dark"]) .lotto-page .prize-label,
	:global(html[data-theme="dark"]) .lotto-page .preview-head span,
	:global(html[data-theme="dark"]) .lotto-page .saved-kicker,
	:global(html[data-theme="dark"]) .lotto-page .saved-empty,
	:global(html[data-theme="dark"]) .lotto-page .sheet-tab small,
	:global(html[data-theme="dark"]) .lotto-page .sheet-detail-head span {
		color: #d6d3d1;
	}

	:global(html[data-theme="dark"]) .lotto-page .round-row strong,
	:global(html[data-theme="dark"]) .lotto-page .prize-total,
	:global(html[data-theme="dark"]) .lotto-page .prize-detail,
	:global(html[data-theme="dark"]) .lotto-page h2,
	:global(html[data-theme="dark"]) .lotto-page .sheet-tab span,
	:global(html[data-theme="dark"]) .lotto-page .sheet-detail-head strong {
		color: #fafaf9;
	}

	:global(html[data-theme="dark"]) .lotto-page .selection-preview,
	:global(html[data-theme="dark"]) .lotto-page .draft-line,
	:global(html[data-theme="dark"]) .lotto-page .sheet-line,
	:global(html[data-theme="dark"]) .lotto-page .sheet-detail,
	:global(html[data-theme="dark"]) .lotto-page .sheet-tab,
	:global(html[data-theme="dark"]) .lotto-page .draft-empty {
		background: #292524;
		border-color: rgba(255, 255, 255, 0.08);
	}

	:global(html[data-theme="dark"]) .lotto-page .draft-empty {
		color: #d6d3d1;
	}

	:global(html[data-theme="dark"]) .lotto-page .empty-ball,
	:global(html[data-theme="dark"]) .lotto-page .action-btn.secondary {
		background: #44403c;
		color: #d6d3d1;
	}
</style>


