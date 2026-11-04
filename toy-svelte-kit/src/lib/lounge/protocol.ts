import type { LoungeSnapshot } from "../types/Lounge";
import type { LoungeSocketPatch } from "../types/LoungeSocket";

export function diffLounge(before: LoungeSnapshot | null, next: LoungeSnapshot): LoungeSocketPatch {
  const old = new Map(before?.players.map((player) => [player.id, JSON.stringify(player)]) ?? []);
  const patch: LoungeSocketPatch = {
    channelId: next.channel.id, baseRevision: before?.revision ?? -1,
    epoch: next.epoch, revision: next.revision, serverNow: next.serverNow,
    players: next.players.filter((player) => old.get(player.id) !== JSON.stringify(player)),
    removed: before?.players.filter((player) => !next.players.some((current) => current.id === player.id)).map((player) => player.id) ?? []
  };
  for (const key of ["foods", "insects", "requests", "notices"] as const) if (!before || JSON.stringify(before[key]) !== JSON.stringify(next[key])) Object.assign(patch, { [key]: next[key] });
  if (!before) patch.messages = next.messages;
  else {
    const previous = new Map(before.messages.map((message) => [message.id, message]));
    const current = new Set(next.messages.map((message) => message.id));
    const added = next.messages.filter((message) => !previous.has(message.id));
    const removed = before.messages.filter((message) => !current.has(message.id)).map((message) => message.id);
    if (added.length || removed.length) patch.messageChanges = { added, removed };
  }
  return patch;
}

export function mergeLounge(snapshot: LoungeSnapshot, patch: LoungeSocketPatch): LoungeSnapshot {
  if (patch.channelId !== snapshot.channel.id || patch.epoch !== snapshot.epoch || patch.baseRevision !== snapshot.revision || patch.revision <= snapshot.revision) return snapshot;
  const players = new Map(snapshot.players.filter((player) => !patch.removed.includes(player.id)).map((player) => [player.id, player]));
  for (const player of patch.players) players.set(player.id, player);
  const { channelId: _channel, baseRevision: _base, removed: _removed, players: _changed, messageChanges, ...state } = patch;
  let messages = state.messages ?? snapshot.messages;
  if (messageChanges) {
    const removed = new Set(messageChanges.removed);
    const merged = new Map(messages.filter((message) => !removed.has(message.id)).map((message) => [message.id, message]));
    for (const message of messageChanges.added) merged.set(message.id, message);
    messages = [...merged.values()].sort((a, b) => a.createdAt - b.createdAt);
  }
  return { ...snapshot, ...state, players: [...players.values()], messages };
}
