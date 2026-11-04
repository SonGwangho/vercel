import type { LoungeFishKind } from "./Lounge";
import type { LoungeInsectKind } from "./LoungeInsect";
import type { LoungeMonsterKind, LoungeMonsterRecord } from "./LoungeMonster";

export type LoungeEncyclopediaRecord = { sizeCm: number; caughtAt: number };
export type LoungeCatchCategory = "fish" | "insects";
export type LoungeCollectionCategory = LoungeCatchCategory | "monsters";
export type LoungeCollectibleKind = LoungeFishKind | LoungeInsectKind;
export type LoungeEncyclopediaKind = LoungeCollectibleKind | LoungeMonsterKind;
export type LoungeEncyclopediaDisplayRecord = LoungeEncyclopediaRecord | LoungeMonsterRecord;
export type LoungeEncyclopediaEntries = Partial<Record<LoungeCollectibleKind, LoungeEncyclopediaRecord>>;
export type LoungeEncyclopediaProfile = { fish: Partial<Record<LoungeFishKind, LoungeEncyclopediaRecord>>; insects: Partial<Record<LoungeInsectKind, LoungeEncyclopediaRecord>>; monsters: Partial<Record<LoungeMonsterKind, LoungeMonsterRecord>>; updatedAt: number | null };
export type LoungeEncyclopediaState = LoungeEncyclopediaProfile & { loading: boolean; loaded: boolean; saving: boolean; error: string };
export type LoungeEncyclopediaInput = { receipt?: unknown; sessionToken?: unknown };
export type LoungeEncyclopediaPending = { id: string; category?: LoungeCatchCategory; kind: LoungeCollectibleKind; sizeCm: number; caughtAt: number; receipt: string; sessionToken: string; token: string };
export type LoungeCatchReceipt = { id: string; category?: LoungeCatchCategory; kind: LoungeCollectibleKind; sizeCm: number; ownerHash: string; caughtAt: number; expiresAt: number };
export type LoungeEncyclopediaRow = { fish: LoungeEncyclopediaProfile["fish"]; insects: LoungeEncyclopediaProfile["insects"]; monsters: LoungeEncyclopediaProfile["monsters"]; updated_at: string };
export type LoungeEncyclopediaProps = { open: boolean; onClose: () => void };
