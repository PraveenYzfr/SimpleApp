/** Host-scoped signed session cookie (HMAC-SHA256). Never set Domain=.praveenyzfr.com */

const COOKIE_NAME = "simpleapp.sid";
const TTL_SECONDS = 8 * 60 * 60;

function b64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj) {
  return btoa(JSON.stringify(obj))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function publicAccount(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    disabled: Boolean(row.disabled),
    createdAt: row.created_at || row.createdAt,
  };
}

export async function createSessionCookie(account, secret, { secure = true } = {}) {
  const csrf = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const payload = {
    accountId: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    csrf,
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const body = b64urlJson(payload);
  const sig = b64url(await hmacSign(secret, body));
  const value = `${body}.${sig}`;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${TTL_SECONDS}`,
  ];
  // Host-scoped only — do NOT set Domain=
  if (secure) parts.push("Secure");
  return { cookie: parts.join("; "), csrf, payload };
}

export function clearSessionCookie({ secure = true } = {}) {
  const parts = [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function readSession(request, secret) {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const raw = cookies[COOKIE_NAME];
  if (!raw || !secret) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = b64url(await hmacSign(secret, body));
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;
  try {
    const pad = body.length % 4 === 0 ? "" : "=".repeat(4 - (body.length % 4));
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const payload = JSON.parse(json);
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getCsrfHeader(request) {
  return request.headers.get("X-CSRF-Token");
}

export { COOKIE_NAME, fromB64url };
