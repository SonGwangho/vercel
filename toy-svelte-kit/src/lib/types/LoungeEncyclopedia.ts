import type { LoungeFishKind } from "./Lounge";
import type { LoungeInsectKind } from "./LoungeInsect";

export type LoungeEncyclopediaRecord = { sizeCm: number; caughtAt: number };
export type LoungeCollectionCategory = "fish" | "insects";
export type LoungeCollectibleKind = LoungeFishKind | LoungeInsectKind;
export type LoungeEncyclopediaEntries = Partial<Record<LoungeCollectibleKind, LoungeEncyclopediaRecord>>;
export type LoungeEncyclopediaProfile = { fish: Partial<Record<LoungeFishKind, LoungeEncyclopediaRecord>>; insects: Partial<Record<LoungeInsectKind, LoungeEncyclopediaRecord>>; updatedAt: number | null };
export type LoungeEncyclopediaState = LoungeEncyclopediaProfile & { loading: boolean; loaded: boolean; saving: boolean; error: string };
export type LoungeEncyclopediaInput = { receipt?: unknown; sessionToken?: unknown };
export type LoungeEncyclopediaPending = { id: string; category?: LoungeCollectionCategory; kind: LoungeCollectibleKind; sizeCm: number; caughtAt: number; receipt: string; sessionToken: string; token: string };
export type LoungeCatchReceipt = { id: string; category?: LoungeCollectionCategory; kind: LoungeCollectibleKind; sizeCm: number; ownerHash: string; caughtAt: number; expiresAt: number };
export type LoungeEncyclopediaRow = { fish: LoungeEncyclopediaProfile["fish"]; insects: LoungeEncyclopediaProfile["insects"]; updated_at: string };
export type LoungeEncyclopediaProps = { open: boolean; onClose: () => void };
