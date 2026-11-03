import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export function createLoungeTicket(secret: string) {
  if (!secret) throw new Error("Lounge socket secret is not configured");
  const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + 60000, nonce: randomUUID() })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyLoungeTicket(ticket: string, secret: string) {
  if (!secret || ticket.length > 512) return false;
  try {
    const [payload, signature] = ticket.split(".");
    const actual = Buffer.from(signature ?? "", "base64url");
    const expected = createHmac("sha256", secret).update(payload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number.isFinite(decoded.expiresAt) && decoded.expiresAt > Date.now() && decoded.expiresAt <= Date.now() + 61000;
  } catch { return false; }
}
