import { Storage } from "$lib/utils/Storage";
import type { LoungeCommand, LoungeJoinInput, LoungeProfile, LoungeSession, LoungeSnapshot } from "$lib/types/Lounge";
import { loungeSocket } from "./loungeSocket";
import { encyclopediaIdentity } from "./encyclopedia.svelte.js";
export { LoungeClientError } from "./loungeError";
export { loungeSocket } from "./loungeSocket";

const sessions = new Map<string, LoungeSession>();
const snapshots = new Map<string, LoungeSnapshot>();
const profileKey = "lounge.profile";
const sessionKey = (channelId: string) => `lounge.session.${channelId}`;

export async function loadLoungeChannels(signal?: AbortSignal) { return loungeSocket.channels(signal); }

export async function loadLoungeProfile() {
  try { return await Storage.get<LoungeProfile>(profileKey); } catch { return null; }
}

export async function joinLoungeChannel(input: LoungeJoinInput) {
  const encyclopediaToken = await encyclopediaIdentity().catch(() => undefined);
  const result = await loungeSocket.join({ ...input, encyclopediaToken });
  sessions.set(input.channelId, result.session);
  snapshots.set(input.channelId, result.snapshot);
  // An unavailable browser database must not strand a successfully joined player.
  await Promise.allSettled([Storage.set(profileKey, input), Storage.set(sessionKey(input.channelId), result.session)]);
  return result;
}

export async function loadLoungeSession(channelId: string) {
  const active = sessions.get(channelId);
  if (active) return active;
  try {
    const stored = await Storage.get<LoungeSession>(sessionKey(channelId));
    if (stored?.channelId === channelId && typeof stored.playerId === "string" && typeof stored.token === "string") {
      sessions.set(channelId, stored);
      return stored;
    }
  } catch { /* The entrance is still available without persistent browser storage. */ }
  return null;
}

export function takeInitialLoungeSnapshot(channelId: string) {
  const result = snapshots.get(channelId) ?? null;
  snapshots.delete(channelId);
  return result;
}

export async function forgetLoungeSession(session: LoungeSession) {
  sessions.delete(session.channelId);
  snapshots.delete(session.channelId);
  try {
    const current = await Storage.get<LoungeSession>(sessionKey(session.channelId));
    if (current?.token === session.token) await Storage.remove(sessionKey(session.channelId));
  } catch { /* Session cleanup is best effort after leaving the server. */ }
}

export async function postLoungeCommand(session: LoungeSession, command: LoungeCommand, _keepalive = false, signal?: AbortSignal) { return loungeSocket.command(session, command, signal); }
