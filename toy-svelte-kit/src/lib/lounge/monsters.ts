import config from "../assets/data/lounge/monsters.json";
import fishing from "../assets/data/lounge/fishing.json";
import { positionAt } from "./shared";
import type { LoungeMonster, LoungeMonsterKind, LoungeMonsterSpecies } from "../types/LoungeMonster";

export const monsterRules = config;
export const monsterSpecies = config.species as LoungeMonsterSpecies[];
export const monsterKinds = monsterSpecies.map((species) => species.kind);
export const describeMonster = (kind: LoungeMonsterKind) => monsterSpecies.find((species) => species.kind === kind)!;
export const monsterChance = (species: LoungeMonsterSpecies) => fishing.species.find((fish) => fish.grade === species.grade)!.weight / fishing.species.reduce((sum, fish) => sum + fish.weight, 0);
export const monsterPunchRange = (monster: LoungeMonster) => monsterRules.punchReach + describeMonster(monster.kind).radius;
export const monsterPositionAt = (monster: LoungeMonster, now: number) => positionAt(monster, now);
