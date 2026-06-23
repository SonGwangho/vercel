import { getNeonSql } from "$lib/server/neon";
import type { BookQuoteRecord, BookRecord, BookSaveRequest, BookSortKey } from "$lib";

type BookRow = {
	id: number;
	title: string;
	author: string | null;
	publisher: string | null;
	memo: string | null;
	read_at: string | null;
	created_at: string;
	updated_at: string;
};

type BookQuoteRow = {
	id: number;
	book_id: number;
	quote: string;
	page_label: string | null;
	tags_json: string | string[] | null;
	note: string | null;
	created_at: string;
	updated_at: string;
};

let booksTableReady: Promise<void> | null = null;

function cleanText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value: unknown): string | null {
	const text = cleanText(value);
	return text ? text : null;
}

function normalizeReadAt(value: unknown): string | null {
	const text = cleanText(value);

	if (!text) {
		return null;
	}

	const date = new Date(`${text}T00:00:00`);
	return Number.isNaN(date.getTime()) ? null : text;
}

function normalizeTags(tags: unknown): string[] {
	if (!Array.isArray(tags)) {
		return [];
	}

	return Array.from(
		new Set(
			tags
				.map((tag) => cleanText(tag))
				.filter(Boolean)
				.slice(0, 12)
		)
	);
}

function parseTags(value: BookQuoteRow["tags_json"]): string[] {
	if (Array.isArray(value)) {
		return value.map((tag) => String(tag)).filter(Boolean);
	}

	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);
		return normalizeTags(parsed);
	} catch {
		return [];
	}
}

function mapBookQuoteRow(row: BookQuoteRow): BookQuoteRecord {
	return {
		id: Number(row.id),
		bookId: Number(row.book_id),
		quote: row.quote,
		page: row.page_label,
		tags: parseTags(row.tags_json),
		note: row.note,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}

function mapBookRow(row: BookRow, quotes: BookQuoteRecord[] = []): BookRecord {
	return {
		id: Number(row.id),
		title: row.title,
		author: row.author,
		publisher: row.publisher,
		memo: row.memo,
		readAt: row.read_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		quotes
	};
}

export function normalizeBookSort(value: unknown): BookSortKey {
	return value === "readAt" || value === "title" ? value : "recent";
}

export async function ensureBooksTables(): Promise<void> {
	if (!booksTableReady) {
		booksTableReady = (async () => {
			const sql = getNeonSql();
			await sql`
				CREATE TABLE IF NOT EXISTS books (
					id BIGSERIAL PRIMARY KEY,
					title TEXT NOT NULL,
					author TEXT,
					publisher TEXT,
					memo TEXT,
					read_at DATE,
					created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
					updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				)
			`;
			await sql`
				CREATE TABLE IF NOT EXISTS book_quotes (
					id BIGSERIAL PRIMARY KEY,
					book_id BIGINT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
					quote TEXT NOT NULL,
					page_label TEXT,
					tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
					note TEXT,
					created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
					updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
				)
			`;
			await sql`
				CREATE INDEX IF NOT EXISTS idx_books_updated_at
				ON books (updated_at DESC)
			`;
			await sql`
				CREATE INDEX IF NOT EXISTS idx_book_quotes_book_id
				ON book_quotes (book_id, created_at DESC)
			`;
		})().catch((error) => {
			booksTableReady = null;
			throw error;
		});
	}

	await booksTableReady;
}

async function getBookById(id: number): Promise<BookRecord | null> {
	await ensureBooksTables();

	const sql = getNeonSql();
	const rows = (await sql`
		SELECT id, title, author, publisher, memo, read_at::text, created_at::text, updated_at::text
		FROM books
		WHERE id = ${id}
		LIMIT 1
	`) as BookRow[];

	if (!rows[0]) {
		return null;
	}

	const quoteRows = (await sql`
		SELECT id, book_id, quote, page_label, tags_json::text, note, created_at::text, updated_at::text
		FROM book_quotes
		WHERE book_id = ${id}
		ORDER BY created_at DESC, id DESC
	`) as BookQuoteRow[];

	return mapBookRow(rows[0], quoteRows.map(mapBookQuoteRow));
}

export async function listBooks(sort: BookSortKey = "recent"): Promise<BookRecord[]> {
	await ensureBooksTables();

	const sql = getNeonSql();
	const rows =
		sort === "title"
			? ((await sql`
					SELECT id, title, author, publisher, memo, read_at::text, created_at::text, updated_at::text
					FROM books
					ORDER BY LOWER(title) ASC, LOWER(COALESCE(author, '')) ASC, id DESC
				`) as BookRow[])
			: sort === "readAt"
				? ((await sql`
						SELECT id, title, author, publisher, memo, read_at::text, created_at::text, updated_at::text
						FROM books
						ORDER BY read_at DESC NULLS LAST, updated_at DESC, id DESC
					`) as BookRow[])
				: ((await sql`
						SELECT id, title, author, publisher, memo, read_at::text, created_at::text, updated_at::text
						FROM books
						ORDER BY updated_at DESC, id DESC
					`) as BookRow[]);

	if (rows.length === 0) {
		return [];
	}

	const bookIds = rows.map((row) => Number(row.id));
	const quoteRows = (await sql`
		SELECT id, book_id, quote, page_label, tags_json::text, note, created_at::text, updated_at::text
		FROM book_quotes
		WHERE book_id = ANY(${bookIds})
		ORDER BY created_at DESC, id DESC
	`) as BookQuoteRow[];
	const quotesByBook = new Map<number, BookQuoteRecord[]>();

	for (const quote of quoteRows.map(mapBookQuoteRow)) {
		const quotes = quotesByBook.get(quote.bookId) ?? [];
		quotes.push(quote);
		quotesByBook.set(quote.bookId, quotes);
	}

	return rows.map((row) => mapBookRow(row, quotesByBook.get(Number(row.id)) ?? []));
}

export async function saveBookRecord(input: BookSaveRequest): Promise<{
	book: BookRecord;
	quote: BookQuoteRecord | null;
}> {
	await ensureBooksTables();

	const title = cleanText(input.title);
	const author = normalizeNullableText(input.author);
	const publisher = normalizeNullableText(input.publisher);
	const memo = normalizeNullableText(input.memo);
	const readAt = normalizeReadAt(input.readAt);
	const bookId = input.bookId === undefined ? null : Number(input.bookId);

	if (!title) {
		throw new Error("title is required.");
	}

	if (bookId !== null && (!Number.isInteger(bookId) || bookId <= 0)) {
		throw new Error("bookId must be a positive integer.");
	}

	const sql = getNeonSql();
	const bookRows =
		bookId === null
			? ((await sql`
					INSERT INTO books (title, author, publisher, memo, read_at)
					VALUES (${title}, ${author}, ${publisher}, ${memo}, ${readAt})
					RETURNING id, title, author, publisher, memo, read_at::text, created_at::text, updated_at::text
				`) as BookRow[])
			: ((await sql`
					UPDATE books
					SET
						title = ${title},
						author = ${author},
						publisher = ${publisher},
						memo = ${memo},
						read_at = ${readAt},
						updated_at = NOW()
					WHERE id = ${bookId}
					RETURNING id, title, author, publisher, memo, read_at::text, created_at::text, updated_at::text
				`) as BookRow[]);

	if (!bookRows[0]) {
		throw new Error("book not found.");
	}

	const savedBookId = Number(bookRows[0].id);
	const quoteText = cleanText(input.quote);
	let savedQuote: BookQuoteRecord | null = null;

	if (quoteText) {
		const page = normalizeNullableText(input.page);
		const note = normalizeNullableText(input.note);
		const tags = JSON.stringify(normalizeTags(input.tags));
		const quoteRows = (await sql`
			INSERT INTO book_quotes (book_id, quote, page_label, tags_json, note)
			VALUES (${savedBookId}, ${quoteText}, ${page}, ${tags}::jsonb, ${note})
			RETURNING id, book_id, quote, page_label, tags_json::text, note, created_at::text, updated_at::text
		`) as BookQuoteRow[];

		await sql`
			UPDATE books
			SET updated_at = NOW()
			WHERE id = ${savedBookId}
		`;

		savedQuote = mapBookQuoteRow(quoteRows[0]);
	}

	const book = await getBookById(savedBookId);

	if (!book) {
		throw new Error("book not found.");
	}

	return {
		book,
		quote: savedQuote
	};
}
