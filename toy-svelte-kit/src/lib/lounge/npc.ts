import settings from "../assets/data/lounge/npc.json";
import { normalizeAppearance } from "./appearance";
import type { LoungeNpc, LoungeNpcInput } from "../types/LoungeNpc";

const appearance = normalizeAppearance(settings.appearance);

export function normalizeNpc(npc: LoungeNpcInput): LoungeNpc {
  return {
    nickname: settings.label, color: appearance.topColor, appearance, joinedAt: 0,
    inventory: [], heldFoodId: null, action: null, pendingRequestId: null, stunnedUntil: 0,
    ...npc
  };
}
