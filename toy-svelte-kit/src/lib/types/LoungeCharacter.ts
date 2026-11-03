import type { BufferGeometry } from "three";
import type { LoungeHairStyle } from "./LoungeAppearance";

export type LoungeHairPart = "hairShort" | "hairBob" | "hairLong" | "hairPonytail" | "hairBun" | "hairTwintails" | "hairSpiky" | "hairBuzz";
export type LoungeCharacterGeometry = "head" | "eye" | "smile" | "openMouth" | "neck" | "body" | "tank" | "hoodie" | "shirtDetails" | "hoodieDetails" | "skinLimb" | "sleeve" | "trouser" | "hand" | "shoe" | "waist" | "skirt" | LoungeHairPart;
export type LoungeCharacterGeometries = Record<LoungeCharacterGeometry, BufferGeometry>;
export type LoungeHairParts = Record<LoungeHairStyle, LoungeHairPart>;
export type LoungeModelProfile = readonly (readonly number[])[];
export type LoungeModelPoint = readonly [number, number, number];
