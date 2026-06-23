export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const response = await fetch(input, init);
	const payload = (await response.json().catch(() => ({}))) as T & { message?: string };

	if (!response.ok) {
		throw new Error(payload.message ?? "요청을 처리하지 못했습니다.");
	}

	return payload;
}
