import gameCodesJson from "$lib/assets/data/game/codes.json";
import type { GameCodeEntry } from "$lib";

const gameCodes = (gameCodesJson as GameCodeEntry[]).slice().sort((a, b) => a.order - b.order);

export function listGameCodes(): GameCodeEntry[] {
	return gameCodes.slice();
}

export function listRankedGames(): GameCodeEntry[] {
	return gameCodes.filter((game) => game.hasRanking);
}

export function getGameCode(id: string): GameCodeEntry | undefined {
	return gameCodes.find((game) => game.id === id);
}

export function requireGameCode(id: string): GameCodeEntry {
	const game = getGameCode(id);

	if (!game) {
		throw new Error(`Game code metadata is missing for "${id}".`);
	}

	return game;
}
