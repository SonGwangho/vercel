import config from "../assets/data/lounge/config.json";
import emotes from "../assets/data/lounge/emotes.json";
import type { LoungeActionKind, LoungeChannel, LoungeEmoteDefinition, LoungeEmoteKind, LoungeFoodDefinition, LoungePlayer, LoungePoint } from "$lib/types/Lounge";

export const loungeWorld = config.world;
export const loungeRules = config.rules;
export const loungeColors = config.colors;
export const loungeChannels: LoungeChannel[] = config.channels;
export const loungeFoods = config.foods as LoungeFoodDefinition[];
export const loungeEmotes = emotes as LoungeEmoteDefinition[];
export const actionNames: Record<LoungeActionKind, string> = {
  handshake: "악수", hug: "포옹", give: "음식 건네기", punch: "펀치", hit: "기절", eat: "먹기", pickup: "줍기", fish: "낚시",
  ...(Object.fromEntries(loungeEmotes.map((emote) => [emote.kind, emote.name])) as Record<LoungeEmoteKind, string>)
};

export function isLoungeEmote(kind: unknown): kind is LoungeEmoteKind {
  return loungeEmotes.some((emote) => emote.kind === kind);
}

export function actionDuration(kind: LoungeActionKind): number {
  return loungeEmotes.find((emote) => emote.kind === kind)?.durationMs
    ?? (kind === "eat" ? 1600 : kind === "pickup" ? 450 : kind === "punch" ? 650 : kind === "hit" ? loungeRules.stunMs : kind === "hug" ? 1800 : 1200);
}
export function foodName(kind: string) {
  return loungeFoods.find((food) => food.kind === kind)?.name ?? "음식";
}

export function interactionRangeFor(kind: LoungeActionKind): number {
  return kind === "handshake" || kind === "hug" || kind === "give" ? loungeRules.socialRange : loungeRules.interactionRange;
}

export function interactionSpacingFor(kind: LoungeActionKind): number {
  if (kind === "handshake") return loungeRules.handshakeDistance;
  if (kind === "hug") return loungeRules.hugDistance;
  if (kind === "give") return loungeRules.giveDistance;
  return 58;
}

export function positionAt(player: Pick<LoungePlayer, "move">, now: number): LoungePoint {
  const move = player.move;
  const progress = move.endsAt <= move.startedAt ? 1 : Math.min(1, Math.max(0, (now - move.startedAt) / (move.endsAt - move.startedAt)));
  if (move.path?.length) {
    let remaining = 0; let cursor = move.from;
    for (const point of move.path) { remaining += distance(cursor, point); cursor = point; }
    remaining *= progress; cursor = move.from;
    for (const point of move.path) {
      const length = distance(cursor, point);
      if (remaining <= length && length > 0) return { x: cursor.x + (point.x - cursor.x) * remaining / length, y: cursor.y + (point.y - cursor.y) * remaining / length };
      remaining -= length; cursor = point;
    }
    return { ...move.to };
  }
  return { x: move.from.x + (move.to.x - move.from.x) * progress, y: move.from.y + (move.to.y - move.from.y) * progress };
}

export function clampPosition(point: LoungePoint): LoungePoint {
  return {
    x: Math.min(loungeWorld.width - loungeWorld.padding, Math.max(loungeWorld.padding, point.x)),
    y: Math.min(loungeWorld.height - loungeWorld.padding, Math.max(loungeWorld.padding, point.y))
  };
}

export function distance(a: LoungePoint, b: LoungePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function interactionBlock(player: LoungePlayer, now: number): string {
  if (player.stunnedUntil > now) return "기절이 풀릴 때까지 기다려 주세요.";
  if (player.pendingCatch) return "잡은 물고기를 가방에 넣거나 버려 주세요.";
  if (player.action && player.action.endsAt > now) return "진행 중인 행동이 끝나면 할 수 있어요.";
  if (player.pendingRequestId) return "먼저 기다리는 상호작용을 마쳐 주세요.";
  return "";
}
