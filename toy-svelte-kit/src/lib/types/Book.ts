export type BookSortKey = "recent" | "readAt" | "title";

export type BookQuoteRecord = {
	id: number;
	bookId: number;
	quote: string;
	page: string | null;
	tags: string[];
	note: string | null;
	createdAt: string;
	updatedAt: string;
};

export type BookRecord = {
	id: number;
	title: string;
	author: string | null;
	publisher: string | null;
	memo: string | null;
	readAt: string | null;
	createdAt: string;
	updatedAt: string;
	quotes: BookQuoteRecord[];
};

export type BookSaveRequest = {
	bookId?: number;
	title: string;
	author?: string;
	publisher?: string;
	memo?: string;
	readAt?: string;
	quote?: string;
	page?: string;
	tags?: string[];
	note?: string;
	savePassword?: string;
};

export type BookSaveResponse = {
	book: BookRecord;
	quote: BookQuoteRecord | null;
};

export type BookListResponse = {
	books: BookRecord[];
	sort: BookSortKey;
};
