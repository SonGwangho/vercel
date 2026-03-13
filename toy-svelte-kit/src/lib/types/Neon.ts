export type NeonHealthResponse = {
	ok: boolean;
	configured: boolean;
	message: string;
	database?: string;
	currentTime?: string;
	error?: string;
};
