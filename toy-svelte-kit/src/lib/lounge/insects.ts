import settings from "../assets/data/lounge/insects.json";
import { fishSpecies } from "./fishing";
import { positionAt } from "./shared";
import type { LoungeFieldInsect, LoungeInsectKind, LoungeInsectSpecies } from "../types/LoungeInsect";

export const insectRules = settings;
export const insectSpecies = settings.species.map((species) => ({ ...species, weight: fishSpecies.find((fish) => fish.grade === species.grade)!.weight })) as LoungeInsectSpecies[];
export function describeInsect(kind: LoungeInsectKind) { return insectSpecies.find((species) => species.kind === kind)!; }
export function insectPositionAt(insect: LoungeFieldInsect, now: number) { return positionAt({ move: insect.move }, now); }
export function insectHeight(insect: LoungeFieldInsect, now: number, reduced = false) {
  if (insect.kind === "bee") return .65 + (reduced ? 0 : Math.sin(now / 170 + insect.seed) * .08);
  if (insect.kind === "butterfly") return .85 + (reduced ? 0 : Math.sin(now / 240 + insect.seed) * .17);
  if (insect.kind === "grasshopper" && insect.move.endsAt > now) {
    const phase = Math.max(0, Math.min(1, (now - insect.move.startedAt) / Math.max(1, insect.move.endsAt - insect.move.startedAt)));
    return .035 + Math.sin(phase * Math.PI) * (reduced ? .18 : .65);
  }
  return .035;
}
export function insectHeldScale(sizeCm: number) { return .44 + Math.min(12, sizeCm) * .018; }
