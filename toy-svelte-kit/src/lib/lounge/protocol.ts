import type { LoungeSnapshot } from "../types/Lounge";
import type { LoungeSocketPatch } from "../types/LoungeSocket";

export function diffLounge(before: LoungeSnapshot | null, next: LoungeSnapshot): LoungeSocketPatch {
  const old = new Map(before?.players.map((player) => [player.id, JSON.stringify(player)]) ?? []);
  const patch: LoungeSocketPatch = {
    epoch: next.epoch, revision: next.revision, serverNow: next.serverNow,
    players: next.players.filter((player) => old.get(player.id) !== JSON.stringify(player)),
    removed: before?.players.filter((player) => !next.players.some((current) => current.id === player.id)).map((player) => player.id) ?? []
  };
  for (const key of ["foods", "requests", "messages", "notices"] as const) if (!before || JSON.stringify(before[key]) !== JSON.stringify(next[key])) Object.assign(patch, { [key]: next[key] });
  return patch;
}

export function mergeLounge(snapshot: LoungeSnapshot, patch: LoungeSocketPatch): LoungeSnapshot {
  if (patch.epoch !== snapshot.epoch || patch.revision <= snapshot.revision) return snapshot;
  const players = new Map(snapshot.players.filter((player) => !patch.removed.includes(player.id)).map((player) => [player.id, player]));
  for (const player of patch.players) players.set(player.id, player);
  const { removed: _removed, players: _changed, ...state } = patch;
  return { ...snapshot, ...state, players: [...players.values()] };
}
