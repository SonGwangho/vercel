<script lang="ts">
	import { goto, invalidateAll } from "$app/navigation";
	import type { BookListResponse, BookRecord, BookSaveResponse, BookSortKey } from "$lib";

	type PageData = BookListResponse & {
		selectedBookId: number | null;
		selectedQuoteId: number | null;
		loadError: string;
	};

	let { data } = $props<{ data: PageData }>();

	let dialog: HTMLDialogElement | null = null;
	let draftBookId = $state<number | null>(null);
	let title = $state("");
	let author = $state("");
	let publisher = $state("");
	let memo = $state("");
	let readAt = $state("");
	let quote = $state("");
	let page = $state("");
	let tags = $state("");
	let note = $state("");
	let savePassword = $state("");
	let saving = $state(false);
	let saveMessage = $state("");

	const books = $derived(data.books);
	const selectedBook = $derived(
		books.find((book) => book.id === data.selectedBookId) ?? books[0] ?? null
	);
	const selectedQuote = $derived(
		selectedBook?.quotes.find((item) => item.id === data.selectedQuoteId) ?? null
	);
	const totalQuotes = $derived(books.reduce((total, book) => total + book.quotes.length, 0));

	function formatDate(value: string | null) {
		if (!value) {
			return "날짜 없음";
		}

		const date = new Date(`${value}T00:00:00`);
		return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ko-KR");
	}

	function quotePreview(value: string) {
		return value.length > 96 ? `${value.slice(0, 96)}...` : value;
	}

	function sortHref(sort: BookSortKey) {
		const params = new URLSearchParams({ sort });

		if (selectedBook) {
			params.set("book", String(selectedBook.id));
		}

		if (selectedQuote) {
			params.set("quote", String(selectedQuote.id));
		}

		return `/books?${params.toString()}`;
	}

	function bookHref(book: BookRecord) {
		const params = new URLSearchParams({
			book: String(book.id),
			sort: data.sort
		});

		return `/books?${params.toString()}`;
	}

	function quoteHref(book: BookRecord, quoteId: number) {
		const params = new URLSearchParams({
			book: String(book.id),
			quote: String(quoteId),
			sort: data.sort
		});

		return `/books?${params.toString()}`;
	}

	function fillBookDraft(book: BookRecord | null) {
		draftBookId = book?.id ?? null;
		title = book?.title ?? "";
		author = book?.author ?? "";
		publisher = book?.publisher ?? "";
		memo = book?.memo ?? "";
		readAt = book?.readAt ?? "";
		quote = "";
		page = "";
		tags = "";
		note = "";
		savePassword = "";
		saveMessage = "";
	}

	function openRecordDialog() {
		fillBookDraft(selectedBook);
		dialog?.showModal();
	}

	function startNewBook() {
		fillBookDraft(null);
	}

	function parseTags() {
		return tags
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
	}

	async function saveRecord() {
		if (saving) {
			return;
		}

		saving = true;
		saveMessage = "";

		try {
			const response = await fetch("/api/books", {
				method: "POST",
				headers: {
					"content-type": "application/json"
				},
				body: JSON.stringify({
					bookId: draftBookId ?? undefined,
					title,
					author,
					publisher,
					memo,
					readAt,
					quote,
					page,
					tags: parseTags(),
					note,
					savePassword
				})
			});
			const payload = (await response.json()) as BookSaveResponse & { message?: string };

			if (!response.ok) {
				throw new Error(payload.message ?? "저장하지 못했습니다.");
			}

			await invalidateAll();

			const params = new URLSearchParams({
				book: String(payload.book.id),
				sort: data.sort
			});

			if (payload.quote) {
				params.set("quote", String(payload.quote.id));
			}

			dialog?.close();
			await goto(`/books?${params.toString()}`);
		} catch (error) {
			saveMessage = error instanceof Error ? error.message : "저장하지 못했습니다.";
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Books</title>
</svelte:head>

<section class="books-page">
	<header class="books-header">
		<div>
			<p class="page-eyebrow">Books</p>
			<h1>읽은 책과 남겨둔 문장</h1>
			<p>책별 독후감과 마음에 남은 글귀를 한곳에 쌓아둡니다.</p>
		</div>
		<button type="button" class="primary-btn" onclick={openRecordDialog}>기록</button>
	</header>

	<div class="books-toolbar" aria-label="책 정렬">
		<a class:active={data.sort === "recent"} href={sortHref("recent")}>최근 기록순</a>
		<a class:active={data.sort === "readAt"} href={sortHref("readAt")}>읽은 날짜순</a>
		<a class:active={data.sort === "title"} href={sortHref("title")}>제목순</a>
	</div>

	{#if data.loadError}
		<section class="empty-panel">
			<h2>기록을 불러오지 못했습니다.</h2>
			<p>{data.loadError}</p>
		</section>
	{:else if books.length === 0}
		<section class="empty-panel">
			<h2>아직 기록한 책이 없습니다.</h2>
			<p>오른쪽 위 기록 버튼으로 첫 책과 문장을 남겨보세요.</p>
		</section>
	{:else if selectedBook}
		<section class="book-overview">
			<div class="book-title-block">
				<div>
					<p class="book-count">{books.length}권 / {totalQuotes}문장</p>
					<h2>{selectedBook.title}</h2>
					<p>
						{selectedBook.author ?? "저자 미상"}
						{#if selectedBook.publisher}
							<span>·</span>
							{selectedBook.publisher}
						{/if}
					</p>
				</div>
				<div class="read-date">
					<span>읽은 날짜</span>
					<strong>{formatDate(selectedBook.readAt)}</strong>
				</div>
			</div>

			{#if selectedQuote}
				<article class="quote-detail">
					<div class="quote-mark">“</div>
					<p class="quote-text">{selectedQuote.quote}</p>
					<div class="quote-meta">
						<span>{selectedQuote.page || "쪽수 없음"}</span>
						{#each selectedQuote.tags as tag}
							<b>{tag}</b>
						{/each}
					</div>
					{#if selectedQuote.note}
						<div class="note-block">
							<h3>내 메모</h3>
							<p>{selectedQuote.note}</p>
						</div>
					{/if}
					<a class="back-link" href={bookHref(selectedBook)}>책 개요로 돌아가기</a>
				</article>
			{:else}
				<div class="memo-panel">
					<h3>독후감</h3>
					<p>{selectedBook.memo || "아직 적어둔 독후감이 없습니다."}</p>
				</div>

				<div class="quote-list">
					<div class="section-heading">
						<h3>마음에 남은 문장</h3>
						<span>{selectedBook.quotes.length}</span>
					</div>

					{#if selectedBook.quotes.length === 0}
						<p class="quiet-text">이 책에 저장된 글귀가 없습니다.</p>
					{:else}
						{#each selectedBook.quotes as item}
							<a class="quote-card" href={quoteHref(selectedBook, item.id)}>
								<p>{quotePreview(item.quote)}</p>
								<div>
									<span>{item.page || "쪽수 없음"}</span>
									{#if item.tags.length > 0}
										<b>{item.tags[0]}</b>
									{/if}
								</div>
							</a>
						{/each}
					{/if}
				</div>
			{/if}
		</section>
	{/if}
</section>

<dialog bind:this={dialog} class="record-dialog">
	<form method="dialog" class="dialog-shell" onsubmit={(event) => event.preventDefault()}>
		<div class="dialog-head">
			<div>
				<p class="page-eyebrow">Record</p>
				<h2>책 기록</h2>
			</div>
			<button type="button" class="icon-btn" aria-label="닫기" onclick={() => dialog?.close()}>×</button>
		</div>

		<div class="form-grid">
			<label>
				<span>책 제목</span>
				<input type="text" bind:value={title} required />
			</label>
			<label>
				<span>저자</span>
				<input type="text" bind:value={author} />
			</label>
			<label>
				<span>출판사</span>
				<input type="text" bind:value={publisher} />
			</label>
			<label>
				<span>읽은 날짜</span>
				<input type="date" bind:value={readAt} />
			</label>
		</div>

		<label>
			<span>독후감</span>
			<textarea rows="5" bind:value={memo}></textarea>
		</label>

		<div class="quote-fields">
			<div class="section-heading">
				<h3>글귀</h3>
				<span>선택 사항</span>
			</div>
			<label>
				<span>문장</span>
				<textarea rows="4" bind:value={quote}></textarea>
			</label>
			<div class="form-grid">
				<label>
					<span>쪽수</span>
					<input type="text" bind:value={page} placeholder="p.42" />
				</label>
				<label>
					<span>태그</span>
					<input type="text" bind:value={tags} placeholder="성장, 태도" />
				</label>
			</div>
			<label>
				<span>글귀 메모</span>
				<textarea rows="3" bind:value={note}></textarea>
			</label>
		</div>

		<label>
			<span>저장 비밀번호</span>
			<input type="password" bind:value={savePassword} autocomplete="off" />
		</label>

		{#if saveMessage}
			<p class="save-message">{saveMessage}</p>
		{/if}

		<div class="dialog-actions">
			<button type="button" class="secondary-btn" onclick={startNewBook}>새 책으로 시작</button>
			<button type="button" class="primary-btn" onclick={() => void saveRecord()} disabled={saving}>
				{saving ? "저장 중" : "저장"}
			</button>
		</div>
	</form>
</dialog>

<style>
	.books-page {
		display: grid;
		gap: 18px;
		width: min(100%, var(--content-wide));
		margin-inline: auto;
	}

	.books-header,
	.book-overview,
	.empty-panel {
		border: 1px solid var(--line);
		border-radius: var(--panel-radius);
		background: color-mix(in srgb, var(--surface) 96%, transparent);
		box-shadow: var(--shadow-card);
	}

	.books-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		padding: 28px;
	}

	.books-header h1,
	.book-title-block h2,
	.dialog-head h2 {
		margin: 0;
		color: var(--text);
		line-height: 1.08;
		letter-spacing: 0;
	}

	.books-header h1 {
		font-size: clamp(30px, 4vw, 44px);
	}

	.books-header p,
	.book-title-block p,
	.quiet-text,
	.empty-panel p {
		margin: 10px 0 0;
		color: var(--muted);
		line-height: 1.7;
	}

	.books-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.books-toolbar a,
	.back-link {
		display: inline-flex;
		align-items: center;
		min-height: 38px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface) 94%, transparent);
		color: var(--muted);
		font-size: 13px;
		font-weight: 800;
		text-decoration: none;
	}

	.books-toolbar a.active,
	.back-link:hover {
		background: var(--surface-strong);
		color: var(--brand-strong);
	}

	.primary-btn,
	.secondary-btn,
	.icon-btn {
		border: none;
		cursor: pointer;
		font-weight: 900;
	}

	.primary-btn,
	.secondary-btn {
		min-height: 42px;
		padding: 0 16px;
		border-radius: 999px;
	}

	.primary-btn {
		background: var(--brand);
		color: #fff;
	}

	.primary-btn:disabled {
		cursor: wait;
		opacity: 0.72;
	}

	.secondary-btn {
		background: var(--surface-strong);
		color: var(--brand-strong);
	}

	.book-overview {
		display: grid;
		gap: 20px;
		padding: 28px;
	}

	.book-title-block {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		align-items: flex-start;
	}

	.book-title-block h2 {
		font-size: clamp(28px, 4vw, 42px);
	}

	.book-count {
		margin: 0 0 8px;
		color: var(--accent-warm);
		font-size: 12px;
		font-weight: 900;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.read-date {
		display: grid;
		gap: 6px;
		min-width: 142px;
		padding: 14px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--surface-strong) 76%, transparent);
		text-align: right;
	}

	.read-date span,
	.quote-meta span,
	.quote-card span,
	label span {
		color: var(--muted);
		font-size: 13px;
		font-weight: 800;
	}

	.read-date strong {
		color: var(--text);
		font-size: 15px;
	}

	.memo-panel,
	.quote-detail {
		padding: 22px;
		border-radius: 18px;
		background: color-mix(in srgb, var(--surface-strong) 58%, transparent);
	}

	.memo-panel h3,
	.note-block h3,
	.section-heading h3 {
		margin: 0;
		color: var(--text);
		font-size: 16px;
	}

	.memo-panel p,
	.note-block p {
		margin: 12px 0 0;
		color: var(--text);
		line-height: 1.8;
		white-space: pre-wrap;
	}

	.quote-list {
		display: grid;
		gap: 10px;
	}

	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}

	.section-heading span {
		color: var(--muted);
		font-size: 13px;
		font-weight: 800;
	}

	.quote-card {
		display: grid;
		gap: 10px;
		padding: 16px;
		border-radius: 14px;
		background: color-mix(in srgb, var(--surface) 96%, transparent);
		color: inherit;
		text-decoration: none;
	}

	.quote-card:hover {
		background: color-mix(in srgb, var(--surface-strong) 82%, transparent);
	}

	.quote-card p {
		margin: 0;
		color: var(--text);
		line-height: 1.7;
	}

	.quote-card div,
	.quote-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.quote-card b,
	.quote-meta b {
		padding: 4px 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--brand) 12%, transparent);
		color: var(--brand-strong);
		font-size: 12px;
	}

	.quote-detail {
		position: relative;
		display: grid;
		gap: 16px;
		overflow: hidden;
	}

	.quote-mark {
		position: absolute;
		top: -28px;
		right: 18px;
		color: color-mix(in srgb, var(--brand) 15%, transparent);
		font-size: 120px;
		font-weight: 900;
		line-height: 1;
	}

	.quote-text {
		position: relative;
		margin: 0;
		color: var(--text);
		font-size: clamp(20px, 3vw, 30px);
		font-weight: 800;
		line-height: 1.55;
		white-space: pre-wrap;
	}

	.note-block {
		position: relative;
	}

	.empty-panel {
		padding: 28px;
	}

	.empty-panel h2 {
		margin: 0;
		font-size: 24px;
	}

	.record-dialog {
		width: min(720px, calc(100vw - 32px));
		max-height: min(840px, calc(100dvh - 32px));
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 22px;
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-card);
	}

	.record-dialog::backdrop {
		background: rgba(15, 23, 42, 0.42);
	}

	.dialog-shell {
		display: grid;
		gap: 18px;
		padding: 24px;
	}

	.dialog-head,
	.dialog-actions {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		align-items: flex-start;
	}

	.icon-btn {
		width: 36px;
		height: 36px;
		border-radius: 999px;
		background: var(--surface-strong);
		color: var(--text);
		font-size: 22px;
		line-height: 1;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}

	label {
		display: grid;
		gap: 8px;
	}

	input,
	textarea {
		width: 100%;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: color-mix(in srgb, var(--surface) 96%, transparent);
		color: var(--ink);
		font: inherit;
	}

	input {
		height: 46px;
		padding: 0 14px;
	}

	textarea {
		min-height: 92px;
		padding: 12px 14px;
		line-height: 1.6;
		resize: vertical;
	}

	input:focus,
	textarea:focus {
		outline: 2px solid color-mix(in srgb, var(--brand) 28%, transparent);
		outline-offset: 2px;
	}

	.quote-fields {
		display: grid;
		gap: 14px;
		padding-top: 4px;
	}

	.save-message {
		margin: 0;
		color: #dc2626;
		font-size: 14px;
		font-weight: 800;
	}

	@media (max-width: 720px) {
		.books-header,
		.book-title-block,
		.dialog-head,
		.dialog-actions {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}

		.books-header,
		.book-overview,
		.empty-panel {
			padding: 20px;
			border-radius: 20px;
		}

		.primary-btn,
		.secondary-btn {
			width: 100%;
		}

		.read-date {
			text-align: left;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}

		.dialog-shell {
			padding: 18px;
		}
	}
</style>
