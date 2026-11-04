import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import settings from "../../assets/data/lounge/encyclopedia.json";
import { describeFish } from "../../lounge/fishing";
import { describeInsect } from "../../lounge/insects";
import type { LoungeFishCatch, LoungeFishKind } from "../../types/Lounge";
import type { LoungeInsectCatch, LoungeInsectKind } from "../../types/LoungeInsect";
import type { LoungeCatchReceipt, LoungeCatchCategory } from "../../types/LoungeEncyclopedia";

export function signCatch(fish: LoungeFishCatch | LoungeInsectCatch, ownerHash: string, now: number, secret: string, category: LoungeCatchCategory = "fish") {
  if (!secret || !ownerHash) return undefined;
  const claim: LoungeCatchReceipt = { id: fish.id, category, kind: fish.kind, sizeCm: fish.sizeCm, ownerHash, caughtAt: now, expiresAt: now + settings.retentionMs };
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyCatch(receipt: unknown, sessionToken: unknown, secret: string): LoungeCatchReceipt | null {
  if (!secret || typeof receipt !== "string" || receipt.length > 1024 || typeof sessionToken !== "string" || !/^[a-f0-9]{64}$/.test(sessionToken)) return null;
  try {
    const parts = receipt.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const actual = Buffer.from(signature, "base64url"), expected = createHmac("sha256", secret).update(payload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LoungeCatchReceipt;
    const category = claim.category ?? "fish";
    if (category !== "fish" && category !== "insects") return null;
    const kinds = category === "insects" ? settings.insectKinds : settings.fishKinds;
    const species = category === "insects" ? describeInsect(claim.kind as LoungeInsectKind) : describeFish(claim.kind as LoungeFishKind);
    const now = Date.now();
    if (!species || !kinds.includes(claim.kind) || typeof claim.id !== "string" || claim.id.length > 64
      || !Number.isInteger(claim.sizeCm) || claim.sizeCm < species.minCm || claim.sizeCm > species.maxCm
      || !Number.isSafeInteger(claim.caughtAt) || claim.caughtAt > now + 5000 || claim.caughtAt <= now - settings.retentionMs
      || claim.expiresAt !== claim.caughtAt + settings.retentionMs || claim.expiresAt <= now
      || claim.ownerHash !== createHash("sha256").update(sessionToken).digest("hex")) return null;
    return claim;
  } catch { return null; }
}
