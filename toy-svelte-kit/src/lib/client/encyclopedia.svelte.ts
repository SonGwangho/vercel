import { Storage } from "$lib/utils/Storage";
import settings from "$lib/assets/data/lounge/encyclopedia.json";
import { monsterKinds } from "$lib/lounge/monsters";
import type { LoungeInsectCatch, LoungeInsectKind } from "$lib/types/LoungeInsect";
import type { LoungeFishCatch, LoungeFishKind, LoungeSession } from "$lib/types/Lounge";
import type { LoungeEncyclopediaPending, LoungeEncyclopediaProfile, LoungeEncyclopediaState, LoungeCatchCategory, LoungeEncyclopediaEntries } from "$lib/types/LoungeEncyclopedia";

export const encyclopediaFish = settings.fishKinds as LoungeFishKind[];
export const encyclopediaInsects = settings.insectKinds as LoungeInsectKind[];
export const encyclopediaMonsters = monsterKinds;
export function encyclopediaRecords(category: LoungeCatchCategory): LoungeEncyclopediaEntries { return encyclopedia[category]; }
export const encyclopedia = $state<LoungeEncyclopediaState>({ fish: {}, insects: {}, monsters: {}, updatedAt: null, loading: false, loaded: false, saving: false, error: "" });
const tokenKey = "lounge.encyclopedia.token";
const queueKey = "lounge.encyclopedia.pending.";
let token = "";
let pending: LoungeEncyclopediaPending[] = [];
let opening: Promise<void> | null = null;
let flushing = false;
let mutation = 0;
let reads = 0;
let retry: ReturnType<typeof setTimeout> | null = null;
let users = 0;
const seen = new Set<string>();

async function initialize() {
  opening ??= (async () => {
    const stored = localStorage.getItem(tokenKey);
    token = stored && /^[a-f0-9]{64}$/.test(stored) ? stored : Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(tokenKey, token);
    const queued = await Storage.getByPrefix<LoungeEncyclopediaPending>(queueKey).catch(() => []);
    pending = queued.filter((item) => typeof item.receipt === "string" && item.caughtAt > Date.now() - settings.retentionMs && (item.category === "insects" ? settings.insectKinds : settings.fishKinds).includes(item.kind));
    for (const item of queued) if (item.caughtAt <= Date.now() - settings.retentionMs) void Storage.remove(queueKey + item.id).catch(() => {});
    for (const item of pending) seen.add(item.id);
    showPending();
  })().catch((cause) => { opening = null; throw cause; });
  await opening;
}

function showPending() {
  for (const item of pending) {
    if (item.token !== token || item.caughtAt <= Date.now() - settings.retentionMs) continue;
    const records = encyclopediaRecords(item.category ?? "fish");
    const old = records[item.kind];
    if (!old || item.sizeCm > old.sizeCm) records[item.kind] = { sizeCm: item.sizeCm, caughtAt: item.caughtAt };
  }
}

function apply(profile: LoungeEncyclopediaProfile) {
  if (profile.updatedAt && encyclopedia.updatedAt && profile.updatedAt < encyclopedia.updatedAt) { showPending(); return; }
  encyclopedia.fish = profile.fish ?? {};
  encyclopedia.insects = profile.insects ?? {};
  encyclopedia.monsters = profile.monsters ?? {};
  encyclopedia.updatedAt = profile.updatedAt;
  encyclopedia.loaded = true;
  showPending();
}

export async function refreshEncyclopedia() {
  const requestId = ++reads;
  encyclopedia.loading = true;
  try {
    await initialize();
    const version = mutation;
    const requestedToken = token;
    const response = await fetch("/api/lounge/encyclopedia", { headers: { authorization: `Bearer ${requestedToken}` }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) throw new Error("도감을 불러오지 못했어요.");
    const profile: LoungeEncyclopediaProfile = await response.json();
    if (requestId === reads && version === mutation && requestedToken === token) apply(profile);
    if (!pending.length) encyclopedia.error = "";
  } catch { if (requestId === reads) encyclopedia.error = "도감을 불러오지 못했어요. 다시 시도해 주세요."; }
  finally { if (requestId === reads) encyclopedia.loading = false; }
}

export async function saveEncyclopedia() {
  if (flushing) return;
  flushing = true;
  if (retry) clearTimeout(retry); retry = null;
  try {
    await initialize();
    encyclopedia.saving = pending.length > 0;
    let rejected = false;
    while (pending.length) {
      const item = pending[0];
      if (item.caughtAt <= Date.now() - settings.retentionMs) { await Storage.remove(queueKey + item.id).catch(() => {}); pending = pending.filter((entry) => entry.id !== item.id); continue; }
      const response = await fetch("/api/lounge/encyclopedia", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${item.token}` },
        body: JSON.stringify({ receipt: item.receipt, sessionToken: item.sessionToken }), signal: AbortSignal.timeout(8000)
      });
      if (response.status === 422) {
        await Storage.remove(queueKey + item.id).catch(() => {});
        pending = pending.filter((entry) => entry.id !== item.id); if (item.token === token) mutation += 1; rejected = true; continue;
      }
      if (!response.ok) throw new Error("도감 기록을 저장하지 못했어요.");
      const profile: LoungeEncyclopediaProfile = await response.json();
      pending = pending.filter((entry) => entry.id !== item.id);
      if (item.token === token) { mutation += 1; apply(profile); }
      await Storage.remove(queueKey + item.id).catch(() => {});
    }
    encyclopedia.error = rejected ? "확인할 수 없는 포획 기록이 있어요. 도감을 다시 불러와 주세요." : "";
    if (rejected) void refreshEncyclopedia();
  } catch { encyclopedia.error = "아직 저장하지 못한 기록이 있어요. 다시 시도해 주세요."; }
  finally {
    flushing = false; encyclopedia.saving = false;
    if (pending.length && users) retry = setTimeout(() => void saveEncyclopedia(), 15000);
  }
}

export async function encyclopediaIdentity() { await initialize(); return token; }

export async function rememberCatch(session: LoungeSession, fish: LoungeFishCatch | LoungeInsectCatch, category: LoungeCatchCategory = "fish") {
  if (!fish.receipt || !fish.caughtAt || seen.has(fish.id) || !(category === "insects" ? settings.insectKinds : settings.fishKinds).includes(fish.kind)) return;
  try {
    await initialize();
    if (seen.has(fish.id)) return;
    seen.add(fish.id);
    const item: LoungeEncyclopediaPending = { id: fish.id, category, kind: fish.kind, sizeCm: fish.sizeCm, caughtAt: fish.caughtAt, receipt: fish.receipt, sessionToken: session.token, token };
    pending.push(item);
    showPending();
    await Storage.set(queueKey + item.id, item).catch(() => { encyclopedia.error = "이 브라우저에 저장 대기 기록을 남기지 못했어요."; });
    void saveEncyclopedia();
  } catch { encyclopedia.error = "브라우저 저장소를 사용할 수 없어 도감을 저장하지 못했어요."; }
}

export function startEncyclopedia() {
  users += 1;
  const sync = () => { void refreshEncyclopedia(); void saveEncyclopedia(); };
  const storage = (event: StorageEvent) => {
    if (event.key !== tokenKey || event.newValue === token) return;
    token = ""; opening = null; mutation += 1;
    encyclopedia.fish = {}; encyclopedia.insects = {}; encyclopedia.monsters = {}; encyclopedia.updatedAt = null; encyclopedia.loaded = false;
    sync();
  };
  sync(); window.addEventListener("online", sync); window.addEventListener("storage", storage);
  return () => { users -= 1; window.removeEventListener("online", sync); window.removeEventListener("storage", storage); if (!users && retry) { clearTimeout(retry); retry = null; } };
}

export function retryEncyclopedia() { void refreshEncyclopedia(); void saveEncyclopedia(); }
