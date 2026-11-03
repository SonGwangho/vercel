import catalog from "../assets/data/lounge/appearance.json";
import type { LoungeAppearance, LoungeAppearanceCatalog, LoungeColorOption, LoungeStyleOption } from "$lib/types/LoungeAppearance";

export const avatarOptions = catalog as LoungeAppearanceCatalog;
const colorValue = (value: unknown, options: LoungeColorOption[], fallback: string) => options.some((option) => option.value === value) ? value as string : fallback;
const styleValue = <T extends string>(value: unknown, options: LoungeStyleOption<T>[], fallback: T): T => options.some((option) => option.id === value) ? value as T : fallback;

export function normalizeAppearance(value?: unknown, legacyColor?: string): LoungeAppearance {
  const source = value && typeof value === "object" ? value as Partial<LoungeAppearance> : {};
  const topColor = colorValue(legacyColor, avatarOptions.topColors, avatarOptions.topColors[0].value);
  return {
    hairStyle: styleValue(source.hairStyle, avatarOptions.hairStyles, "short"),
    hairColor: colorValue(source.hairColor, avatarOptions.hairColors, avatarOptions.hairColors[0].value),
    topStyle: styleValue(source.topStyle, avatarOptions.topStyles, "longSleeve"),
    topColor: colorValue(source.topColor, avatarOptions.topColors, topColor),
    bottomStyle: styleValue(source.bottomStyle, avatarOptions.bottomStyles, "longPants"),
    pantsColor: colorValue(source.pantsColor, avatarOptions.bottomColors, avatarOptions.bottomColors[0].value),
    skirtColor: colorValue(source.skirtColor, avatarOptions.bottomColors, "#8b70bf")
  };
}

export const isSkirt = (appearance: LoungeAppearance) => appearance.bottomStyle === "longSkirt" || appearance.bottomStyle === "shortSkirt";

export function randomAppearance(): LoungeAppearance {
  const pick = <T>(options: T[]) => options[Math.floor(Math.random() * options.length)];
  return {
    hairStyle: pick(avatarOptions.hairStyles).id, hairColor: pick(avatarOptions.hairColors).value,
    topStyle: pick(avatarOptions.topStyles).id, topColor: pick(avatarOptions.topColors).value,
    bottomStyle: pick(avatarOptions.bottomStyles).id,
    pantsColor: pick(avatarOptions.bottomColors).value, skirtColor: pick(avatarOptions.bottomColors).value
  };
}
