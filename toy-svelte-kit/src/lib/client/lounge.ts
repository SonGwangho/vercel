import { Storage } from "$lib/utils/Storage";
import type { LoungeChannelSummary, LoungeCommand, LoungeJoinInput, LoungeJoinResult, LoungeProfile, LoungeSession, LoungeSnapshot, LoungeSyncResult } from "$lib/types/Lounge";

const sessions = new Map<string, LoungeSession>();
const snapshots = new Map<string, LoungeSnapshot>();
const profileKey = "lounge.profile";
const sessionKey = (channelId: string) => `lounge.session.${channelId}`;

export class LoungeClientError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new LoungeClientError(body?.message ?? "연결이 원활하지 않아요. 다시 시도해 주세요.", response.status);
  return body as T;
}

export async function loadLoungeChannels(signal?: AbortSignal) {
  const response = await fetch("/api/lounge/channels", { cache: "no-store", signal: signal ?? AbortSignal.timeout(12000) });
  const body = await responseBody<{ channels: LoungeChannelSummary[] }>(response);
  return body.channels;
}

export async function loadLoungeProfile() {
  try { return await Storage.get<LoungeProfile>(profileKey); } catch { return null; }
}

export async function joinLoungeChannel(input: LoungeJoinInput) {
  const response = await fetch("/api/lounge/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
  const result = await responseBody<LoungeJoinResult>(response);
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

export async function fetchLoungeSnapshot(session: LoungeSession, signal: AbortSignal, revision?: number) {
  const suffix = revision === undefined ? "" : `?since=${revision}&wait=1`;
  const response = await fetch(`/api/lounge/${encodeURIComponent(session.channelId)}${suffix}`, {
    headers: { authorization: `Bearer ${session.token}`, "x-lounge-player": session.playerId }, cache: "no-store", signal
  });
  return responseBody<LoungeSyncResult>(response);
}

export async function postLoungeCommand(session: LoungeSession, command: LoungeCommand, keepalive = false, signal?: AbortSignal) {
  const response = await fetch(`/api/lounge/${encodeURIComponent(session.channelId)}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.token}`, "x-lounge-player": session.playerId },
    body: JSON.stringify(command), keepalive, signal: signal ?? AbortSignal.timeout(12000)
  });
  return responseBody<LoungeSnapshot>(response);
}
