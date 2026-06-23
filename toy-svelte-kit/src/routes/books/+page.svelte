<script lang="ts">
	import { goto, invalidateAll } from "$app/navigation";
	import type { BookListResponse, BookQuoteRecord, BookRecord, BookSaveResponse, BookSortKey } from "$lib";

	type PageData = BookListResponse & {
		selectedBookId: number | null;
		selectedQuoteId: number | null;
		loadError: string;
	};

	type RecordMode = "book" | "quote";

	let { data } = $props<{ data: PageData }>();

	let dialog: HTMLDialogElement | null = null;
	let passwordDialog: HTMLDialogElement | null = null;
	let recordMode = $state<RecordMode>("book");
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
	let passwordMessage = $state("");

	const books = $derived(data.books);
	const selectedBook = $derived(
		books.find((book: BookRecord) => book.id === data.selectedBookId) ?? books[0] ?? null
	);
	const selectedQuote = $derived(
		selectedBook?.quotes.find((item: BookQuoteRecord) => item.id === data.selectedQuoteId) ?? null
	);

	function todayDate() {
		const now = new Date();
		const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
		return localDate.toISOString().slice(0, 10);
	}

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

	function fillBookDraft(book: BookRecord | null, mode: RecordMode) {
		recordMode = mode;
		draftBookId = book?.id ?? null;
		title = book?.title ?? "";
		author = book?.author ?? "";
		publisher = book?.publisher ?? "";
		memo = book?.memo ?? "";
		readAt = mode === "book" ? (book?.readAt ?? todayDate()) : (book?.readAt ?? "");
		quote = "";
		page = "";
		tags = "";
		note = "";
		savePassword = "";
		saveMessage = "";
		passwordMessage = "";
	}

	function openBookRecordDialog() {
		fillBookDraft(null, "book");
		dialog?.showModal();
	}

	function openQuoteRecordDialog() {
		if (!selectedBook) {
			return;
		}

		fillBookDraft(selectedBook, "quote");
		dialog?.showModal();
	}

	function parseTags() {
		return tags
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
	}

	function requestSavePassword() {
		if (recordMode === "book" && !title.trim()) {
			saveMessage = "책 제목을 입력해 주세요.";
			return;
		}

		if (recordMode === "quote" && !draftBookId) {
			saveMessage = "책을 먼저 선택해 주세요.";
			return;
		}

		if (recordMode === "quote" && !quote.trim()) {
			saveMessage = "글귀를 입력해 주세요.";
			return;
		}

		savePassword = "";
		saveMessage = "";
		passwordMessage = "";
		passwordDialog?.showModal();
	}

	async function saveRecord() {
		if (saving) {
			return;
		}

		saving = true;
		passwordMessage = "";

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
					quote: recordMode === "quote" ? quote : "",
					page: recordMode === "quote" ? page : "",
					tags: recordMode === "quote" ? parseTags() : [],
					note: recordMode === "quote" ? note : "",
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

			passwordDialog?.close();
			dialog?.close();
			await goto(`/books?${params.toString()}`);
		} catch (error) {
			passwordMessage = error instanceof Error ? error.message : "저장하지 못했습니다.";
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Books</title>
</svelte:head>

<section class="books-page">
	<div class="books-actions">
		<nav aria-label="책 정렬" class="sort-links">
			<a class:active={data.sort === "recent"} href={sortHref("recent")}>최근순</a>
			<a class:active={data.sort === "readAt"} href={sortHref("readAt")}>읽은순</a>
			<a class:active={data.sort === "title"} href={sortHref("title")}>제목순</a>
		</nav>
		<div class="record-actions">
			{#if selectedBook}
				<button type="button" class="secondary-btn" onclick={openBookRecordDialog}>책 기록</button>
				<button type="button" class="primary-btn" onclick={openQuoteRecordDialog}>글귀 메모</button>
			{:else}
				<button type="button" class="primary-btn" onclick={openBookRecordDialog}>책 기록</button>
			{/if}
		</div>
	</div>

	{#if data.loadError}
		<section class="book-document">
			<h2>기록을 불러오지 못했습니다.</h2>
			<p>{data.loadError}</p>
		</section>
	{:else if books.length === 0}
		<section class="book-document">
			<h2>기록 없음</h2>
			<p>아직 기록한 책이 없습니다.</p>
		</section>
	{:else if selectedBook}
		<section class="book-document">
			<header class="document-head">
				<h1>{selectedBook.title}</h1>
				<dl>
					<div>
						<dt>저자</dt>
						<dd>{selectedBook.author ?? "저자 미상"}</dd>
					</div>
					<div>
						<dt>출판사</dt>
						<dd>{selectedBook.publisher ?? "출판사 없음"}</dd>
					</div>
					<div>
						<dt>날짜</dt>
						<dd>{formatDate(selectedBook.readAt)}</dd>
					</div>
					<div>
						<dt>글귀</dt>
						<dd>{selectedBook.quotes.length}</dd>
					</div>
				</dl>
			</header>

			{#if selectedQuote}
				<article class="quote-detail" aria-label="글귀">
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
				<section class="document-section">
					<h2>독후감</h2>
					<p>{selectedBook.memo || "아직 적어둔 독후감이 없습니다."}</p>
				</section>

				<section class="document-section">
					<h2>글귀</h2>

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
				</section>
			{/if}
		</section>
	{/if}
</section>

<dialog bind:this={dialog} class="record-dialog">
	<form method="dialog" class="dialog-shell" onsubmit={(event) => event.preventDefault()}>
		<div class="dialog-head">
			<div>
				<h2>{recordMode === "quote" ? "글귀 메모" : "책 독후감 기록"}</h2>
			</div>
			<button type="button" class="icon-btn" aria-label="닫기" onclick={() => dialog?.close()}>×</button>
		</div>

		{#if recordMode === "book"}
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
				<textarea rows="7" bind:value={memo}></textarea>
			</label>
		{:else}
			<div class="selected-book-line">
				<span>책</span>
				<strong>{title}</strong>
			</div>

			<div class="quote-fields">
				<label>
					<span>글귀</span>
					<textarea rows="5" bind:value={quote}></textarea>
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
					<span>메모</span>
					<textarea rows="4" bind:value={note}></textarea>
				</label>
			</div>
		{/if}

		{#if saveMessage}
			<p class="save-message">{saveMessage}</p>
		{/if}

		<div class="dialog-actions">
			<button type="button" class="secondary-btn" onclick={() => dialog?.close()}>취소</button>
			<button type="button" class="primary-btn" onclick={requestSavePassword} disabled={saving}>
				저장
			</button>
		</div>
	</form>
</dialog>

<dialog bind:this={passwordDialog} class="password-dialog">
	<form
		method="dialog"
		class="password-shell"
		onsubmit={(event) => {
			event.preventDefault();
			void saveRecord();
		}}
	>
		<div class="dialog-head">
			<h2>비밀번호</h2>
			<button type="button" class="icon-btn" aria-label="닫기" onclick={() => passwordDialog?.close()}>
				×
			</button>
		</div>

		<label>
			<span>저장 비밀번호</span>
			<input type="password" bind:value={savePassword} autocomplete="off" />
		</label>

		{#if passwordMessage}
			<p class="save-message">{passwordMessage}</p>
		{/if}

		<div class="dialog-actions">
			<button type="button" class="secondary-btn" onclick={() => passwordDialog?.close()}>취소</button>
			<button type="submit" class="primary-btn" disabled={saving}>
				{saving ? "저장 중" : "확인"}
			</button>
		</div>
	</form>
</dialog>

<style>
	.books-page {
		display: grid;
		gap: 12px;
		width: min(100%, var(--content-narrow));
		margin-inline: auto;
	}

	.books-actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 10px;
	}

	.sort-links {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.record-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}

	.sort-links a,
	.back-link {
		display: inline-flex;
		align-items: center;
		min-height: 34px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface) 90%, transparent);
		color: var(--muted);
		font-size: 12px;
		font-weight: 800;
		text-decoration: none;
	}

	.sort-links a.active,
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

	.book-document {
		display: grid;
		gap: 26px;
		padding: 28px;
		border: 1px solid var(--line);
		border-radius: var(--panel-radius);
		background: color-mix(in srgb, var(--surface) 96%, transparent);
		box-shadow: var(--shadow-card);
	}

	.document-head {
		display: grid;
		gap: 16px;
	}

	.document-head h1 {
		margin: 0;
		color: var(--text);
		font-size: clamp(30px, 4vw, 42px);
		line-height: 1.12;
		letter-spacing: 0;
	}

	.document-head dl {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
		margin: 0;
	}

	.document-head div {
		display: grid;
		gap: 4px;
		padding: 10px 0;
		border-top: 1px solid var(--line);
	}

	.document-head dt,
	.quote-meta span,
	.quote-card span,
	.selected-book-line span,
	label span {
		color: var(--muted);
		font-size: 13px;
		font-weight: 800;
	}

	.document-head dd {
		margin: 0;
		color: var(--text);
		font-size: 14px;
		line-height: 1.5;
	}

	.document-section {
		display: grid;
		gap: 12px;
	}

	.document-section h2,
	.note-block h3,
	.dialog-head h2 {
		margin: 0;
		color: var(--text);
		font-size: 18px;
		line-height: 1.3;
	}

	.document-section p,
	.note-block p,
	.quiet-text,
	.book-document > p {
		margin: 0;
		color: var(--text);
		line-height: 1.8;
		white-space: pre-wrap;
	}

	.book-document > p {
		color: var(--muted);
	}

	.document-section h2 + .quiet-text {
		color: var(--muted);
	}

	.quote-card {
		display: grid;
		gap: 10px;
		padding: 14px 0;
		border-top: 1px solid var(--line);
		background: transparent;
		color: inherit;
		text-decoration: none;
	}

	.quote-card:hover {
		background: color-mix(in srgb, var(--surface-strong) 38%, transparent);
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

	.selected-book-line {
		display: grid;
		gap: 6px;
		padding: 12px 14px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: color-mix(in srgb, var(--surface-strong) 58%, transparent);
	}

	.selected-book-line strong {
		color: var(--text);
		font-size: 15px;
		line-height: 1.5;
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

	.password-dialog {
		width: min(360px, calc(100vw - 32px));
		padding: 0;
		border: 1px solid var(--line);
		border-radius: 20px;
		background: var(--surface);
		color: var(--text);
		box-shadow: var(--shadow-card);
	}

	.record-dialog::backdrop {
		background: rgba(15, 23, 42, 0.42);
	}

	.password-dialog::backdrop {
		background: rgba(15, 23, 42, 0.34);
	}

	.dialog-shell {
		display: grid;
		gap: 18px;
		padding: 24px;
	}

	.password-shell {
		display: grid;
		gap: 16px;
		padding: 20px;
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
		.books-actions,
		.record-actions,
		.dialog-head,
		.dialog-actions {
			display: grid;
			grid-template-columns: minmax(0, 1fr);
		}

		.book-document {
			padding: 20px;
			border-radius: 20px;
		}

		.primary-btn,
		.secondary-btn {
			width: 100%;
		}

		.document-head dl {
			grid-template-columns: 1fr;
		}

		.form-grid {
			grid-template-columns: 1fr;
		}

		.dialog-shell {
			padding: 18px;
		}
	}
</style>
