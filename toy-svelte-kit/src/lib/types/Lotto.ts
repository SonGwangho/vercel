export type LottoOfficialItem = {
	ltEpsd: number;
	tm1WnNo: number;
	tm2WnNo: number;
	tm3WnNo: number;
	tm4WnNo: number;
	tm5WnNo: number;
	tm6WnNo: number;
	bnsWnNo: number;
	ltRflYmd: string;
	rnk1WnNope: number;
	rnk1WnAmt: number;
	rnk1SumWnAmt: number;
};

export type LottoOfficialPayload = {
	data?: {
		list?: LottoOfficialItem[];
	};
};

export type LottoRoundResult = {
	round: number;
	roundLabel: string;
	drawDate: string;
	drawDateLabel: string;
	numbers: number[];
	bonusNumber: number;
	firstPrizeTotalAmount: number;
	firstPrizeTotalAmountEok: string;
	firstPrizeAmount: number;
	firstPrizeAmountEok: string;
	firstPrizeWinnerCount: number;
};

export type LottoLatestResponse = {
	latest: LottoRoundResult;
};

export type LottoLine = {
	id: string;
	numbers: number[];
};

export type LottoSheet = {
	id: string;
	targetRound: number;
	lines: LottoLine[];
	createdAt: string;
};
