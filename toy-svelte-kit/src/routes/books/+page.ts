import type { BookListResponse, BookSortKey } from "$lib";

function normalizeSort(value: string | null): BookSortKey {
	return value === "readAt" || value === "title" ? value : "recent";
}

function positiveInteger(value: string | null): number | null {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export const load = async ({ fetch, url }: { fetch: typeof globalThis.fetch; url: URL }) => {
	const sort = normalizeSort(url.searchParams.get("sort"));
	const params = new URLSearchParams({ sort });
	const selectedBookId = positiveInteger(url.searchParams.get("book"));
	const selectedQuoteId = positiveInteger(url.searchParams.get("quote"));

	try {
		const response = await fetch(`/api/books?${params.toString()}`);
		const payload = (await response.json()) as Partial<BookListResponse> & { message?: string };

		if (!response.ok || !payload.books) {
			return {
				books: [],
				sort,
				selectedBookId,
				selectedQuoteId,
				loadError: payload.message ?? "책 기록을 불러오지 못했습니다."
			};
		}

		return {
			books: payload.books,
			sort: payload.sort ?? sort,
			selectedBookId,
			selectedQuoteId,
			loadError: ""
		};
	} catch {
		return {
			books: [],
			sort,
			selectedBookId,
			selectedQuoteId,
			loadError: "책 기록을 불러오지 못했습니다."
		};
	}
};
