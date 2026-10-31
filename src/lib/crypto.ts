import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "voter_session";
export const SESSION_SECONDS = 60 * 60 * 24;
export type Identity = { memberId: string } | { bootstrap: true };

export function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}
export function hashValue(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function hashCode(code: string, secret: string) {
  return hashValue(`code:${normalizeCode(code)}`, secret);
}
export function generateCode() {
  return randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g)!.join("-");
}
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function signSession(
  identity: Identity,
  secret: string,
  now = Date.now(),
) {
  const body = Buffer.from(
    JSON.stringify({ ...identity, expires: now + SESSION_SECONDS * 1000 }),
  ).toString("base64url");
  return `${body}.${hashValue(body, secret)}`;
}
export function verifySession(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Identity | null {
  if (!token || token.length > 1024) return null;
  const [body, signature, extra] = token.split(".");
  if (
    !body ||
    !signature ||
    extra ||
    !safeEqual(hashValue(body, secret), signature)
  )
    return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof data.expires !== "number" || data.expires <= now) return null;
    if (data.bootstrap === true) return { bootstrap: true };
    if (
      typeof data.memberId === "string" &&
      /^[a-f0-9-]{36}$/i.test(data.memberId)
    )
      return { memberId: data.memberId };
    return null;
  } catch {
    return null;
  }
}
