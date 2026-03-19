import type { RankingRecord } from "./Ranking";

export type AdminRankingRecord = RankingRecord & {
	ipAddress: string | null;
};

export type AdminRankingListResponse = {
	rankings: AdminRankingRecord[];
};

export type AdminRankingListQuery = {
	gameCode?: number;
	limit?: number;
};

export type IpBanRecord = {
	id: number;
	ipAddress: string;
	note: string;
	createdAt: string;
	updatedAt: string;
};

export type IpBanCreateRequest = {
	ipAddress: string;
	note?: string;
};

export type IpBanListResponse = {
	bans: IpBanRecord[];
};

export type IpBanMutationResponse = {
	ban: IpBanRecord;
};

export type IpBanDeleteResponse = {
	deleted: boolean;
	id: number;
};
