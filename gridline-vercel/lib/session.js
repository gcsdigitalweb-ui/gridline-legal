const crypto = require("crypto");

const SECRET = process.env.SESSION_SECRET || "dev-secret";
const COOKIE_NAME = "gx_session";

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function sign(payload) {
  const data = b64url(Buffer.from(JSON.stringify(payload)));
  const hmac = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  return `${data}.${hmac}`;
}

function verify(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, hmac] = parts;
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  if (hmac !== expected) return null;
  try {
    return JSON.parse(fromB64url(data).toString());
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function getSession(req) {
  const cookies = parseCookies(req);
  return verify(cookies[COOKIE_NAME]);
}

function setSessionCookie(res, payload) {
  const token = sign(payload);
  const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + 60 * 60 * 24 * 7,
  ];
  if (isProd) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

module.exports = { getSession, setSessionCookie, clearSessionCookie };
