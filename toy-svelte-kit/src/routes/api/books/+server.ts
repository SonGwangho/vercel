import { json, type RequestHandler } from "@sveltejs/kit";

import { listBooks, normalizeBookSort, saveBookRecord } from "$lib/server/books";
import { withApiHook } from "$lib/server/hooks/api";
import type { BookListResponse, BookSaveRequest, BookSaveResponse } from "$lib";

const BOOK_SAVE_PASSWORD = "159023";

const getBooks: RequestHandler = async (event) => {
	const sort = normalizeBookSort(event.url.searchParams.get("sort"));
	const books = await listBooks(sort);
	const body: BookListResponse = {
		books,
		sort
	};

	return json(body);
};

const saveBook: RequestHandler = async (event) => {
	let payload: BookSaveRequest;

	try {
		payload = (await event.request.json()) as BookSaveRequest;
	} catch {
		return json({ message: "Invalid JSON body." }, { status: 400 });
	}

	if (payload.savePassword !== BOOK_SAVE_PASSWORD) {
		return json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 });
	}

	try {
		const result = await saveBookRecord(payload);
		const body: BookSaveResponse = result;
		return json(body, { status: payload.bookId ? 200 : 201 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to save book.";
		const status = message.includes("required") || message.includes("must be") ? 400 : 500;
		return json({ message }, { status });
	}
};

export const GET = withApiHook(getBooks);
export const POST = withApiHook(saveBook);
