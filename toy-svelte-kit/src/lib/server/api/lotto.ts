import { json } from "@sveltejs/kit";

import type { LottoLatestResponse, LottoOfficialPayload, LottoRoundResult } from "$lib";

const LOTTO_LATEST_URL = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do";

function parseDateLabel(raw: string) {
	if (!/^\d{8}$/.test(raw)) {
		return raw;
	}

	return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} 추첨`;
}

function formatEok(value: number) {
	return (value / 100000000).toFixed(1);
}

function normalizeRoundResult(payload: LottoOfficialPayload): LottoRoundResult | null {
	const item = payload.data?.list?.[0];

	if (!item) {
		return null;
	}

	return {
		round: item.ltEpsd,
		roundLabel: `제${item.ltEpsd}회`,
		drawDate: item.ltRflYmd,
		drawDateLabel: parseDateLabel(item.ltRflYmd),
		numbers: [item.tm1WnNo, item.tm2WnNo, item.tm3WnNo, item.tm4WnNo, item.tm5WnNo, item.tm6WnNo],
		bonusNumber: item.bnsWnNo,
		firstPrizeTotalAmount: item.rnk1SumWnAmt,
		firstPrizeTotalAmountEok: formatEok(item.rnk1SumWnAmt),
		firstPrizeAmount: item.rnk1WnAmt,
		firstPrizeAmountEok: formatEok(item.rnk1WnAmt),
		firstPrizeWinnerCount: item.rnk1WnNope
	};
}

export async function handleLottoRequest(fetcher: typeof fetch): Promise<Response> {
	const response = await fetcher(LOTTO_LATEST_URL, {
		headers: {
			accept: "application/json, text/plain, */*",
			"accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
			"x-requested-with": "XMLHttpRequest"
		}
	});

	if (!response.ok) {
		return json({ message: "Failed to load lotto result." }, { status: 502 });
	}

	let payload: LottoOfficialPayload;

	try {
		payload = (await response.json()) as LottoOfficialPayload;
	} catch {
		return json({ message: "Failed to parse lotto result." }, { status: 502 });
	}

	const latest = normalizeRoundResult(payload);

	if (!latest) {
		return json({ message: "Latest lotto result is empty." }, { status: 502 });
	}

	const body: LottoLatestResponse = {
		latest
	};

	return json(body, {
		headers: {
			"cache-control": "no-store"
		}
	});
}
