"use strict";

/**
 * Google identity + signed first-party sessions.
 *
 * Google verifies the account and returns an ID token. The server verifies
 * that token with Google's official library, then issues a short, HttpOnly,
 * SameSite session cookie. A second signed token records the cart-level
 * researcher acknowledgement and is bound to the authenticated Google user.
 */

const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const config = require("./config");

const COOKIE_NAME = "nv_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

let googleClient = null;

function configError(message) {
  const err = new Error(message);
  err.code = "AUTH_CONFIG";
  return err;
}

function isPlaceholder(value) {
  return !value || /^REPLACE_WITH_/i.test(String(value));
}

function configStatus() {
  const clientId = !isPlaceholder(config.auth.googleClientId);
  const sessionSecret =
    !isPlaceholder(config.auth.sessionSecret) && String(config.auth.sessionSecret).length >= 32;
  return {
    ok: clientId && sessionSecret,
    googleClientId: clientId,
    sessionSecret,
  };
}

function assertConfigured() {
  const status = configStatus();
  if (!status.googleClientId) {
    throw configError("GOOGLE_CLIENT_ID is not configured.");
  }
  if (!status.sessionSecret) {
    throw configError("AUTH_SESSION_SECRET must be at least 32 random characters.");
  }
}

function b64json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(body, purpose) {
  return crypto
    .createHmac("sha256", config.auth.sessionSecret)
    .update(purpose + "." + body)
    .digest("base64url");
}

function signToken(payload, purpose) {
  assertConfigured();
  const body = b64json(payload);
  return body + "." + signature(body, purpose);
}

function verifyToken(token, purpose) {
  assertConfigured();
  if (typeof token !== "string" || token.length > 8192) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = Buffer.from(signature(parts[0], purpose));
  const provided = Buffer.from(parts[1]);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (!payload || !Number.isFinite(payload.exp) || payload.exp <= now) return null;
    return payload;
  } catch (_err) {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  String(req.get("Cookie") || "")
    .split(";")
    .forEach((part) => {
      const idx = part.indexOf("=");
      if (idx < 1) return;
      const key = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      try {
        out[key] = decodeURIComponent(value);
      } catch (_err) {
        out[key] = value;
      }
    });
  return out;
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.sub,
    email: user.email,
    name: user.name || "",
    picture: user.picture || "",
  };
}

function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);
  return signToken(
    {
      typ: "session",
      sub: user.sub,
      email: user.email,
      name: user.name || "",
      picture: user.picture || "",
      iat: now,
      exp: now + SESSION_SECONDS,
    },
    "session"
  );
}

function setSessionCookie(res, user) {
  res.cookie(COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
  });
}

function getSession(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const payload = verifyToken(token, "session");
  if (!payload || payload.typ !== "session" || !payload.sub || !payload.email) return null;
  return payload;
}

async function verifyGoogleCredential(credential) {
  assertConfigured();
  if (typeof credential !== "string" || credential.length < 100 || credential.length > 8192) {
    return null;
  }
  if (!googleClient) googleClient = new OAuth2Client(config.auth.googleClientId);
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.auth.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) return null;
    return {
      sub: payload.sub,
      email: String(payload.email).toLowerCase(),
      name: String(payload.name || "").slice(0, 120),
      picture: String(payload.picture || "").slice(0, 1000),
    };
  } catch (_err) {
    return null;
  }
}

function requireSameOrigin(req, res, next) {
  const origin = req.get("Origin");
  if (!origin && !config.isProduction) return next();
  try {
    const source = new URL(origin);
    if (source.host !== req.get("Host") || (config.isProduction && source.protocol !== "https:")) {
      return res.status(403).json({ error: "Request origin could not be verified." });
    }
    return next();
  } catch (_err) {
    return res.status(403).json({ error: "Request origin could not be verified." });
  }
}

function requireAuth(req, res, next) {
  try {
    assertConfigured();
    const user = getSession(req);
    if (!user) return res.status(401).json({ error: "Sign in with Google to continue." });
    req.user = user;
    return next();
  } catch (err) {
    if (err.code === "AUTH_CONFIG") {
      return res.status(503).json({ error: "Google sign-in is not configured yet." });
    }
    return next(err);
  }
}

function issueResearchVerification(user) {
  const now = Math.floor(Date.now() / 1000);
  const acceptedAt = new Date(now * 1000).toISOString();
  const exp = now + config.researchVerification.cartTokenMinutes * 60;
  const payload = {
    typ: "research-verification",
    sub: user.sub,
    email: user.email,
    version: config.researchVerification.version,
    age21: true,
    qualifiedResearcher: true,
    researchUseOnly: true,
    acceptedAt,
    iat: now,
    exp,
  };
  return {
    token: signToken(payload, "research-verification"),
    record: {
      accountId: user.sub,
      email: user.email,
      version: payload.version,
      age21: true,
      qualifiedResearcher: true,
      researchUseOnly: true,
      acceptedAt,
      expiresAt: new Date(exp * 1000).toISOString(),
    },
  };
}

function verifyResearchVerification(token, user) {
  const payload = verifyToken(token, "research-verification");
  if (
    !payload ||
    payload.typ !== "research-verification" ||
    payload.sub !== user.sub ||
    String(payload.email || "").toLowerCase() !== String(user.email || "").toLowerCase() ||
    payload.version !== config.researchVerification.version ||
    payload.age21 !== true ||
    payload.qualifiedResearcher !== true ||
    payload.researchUseOnly !== true
  ) {
    return null;
  }
  const accepted = Date.parse(payload.acceptedAt);
  const now = Date.now();
  const maxAge = config.researchVerification.cartTokenMinutes * 60 * 1000;
  if (!Number.isFinite(accepted) || accepted > now + 60_000 || now - accepted > maxAge + 60_000) {
    return null;
  }
  return {
    version: payload.version,
    age21: true,
    qualifiedResearcher: true,
    researchUseOnly: true,
    acceptedAt: payload.acceptedAt,
    authenticatedAccountId: user.sub,
    authenticatedEmail: user.email,
  };
}

module.exports = {
  COOKIE_NAME,
  clearSessionCookie,
  configStatus,
  createSessionToken,
  getSession,
  issueResearchVerification,
  requireAuth,
  requireSameOrigin,
  safeUser,
  setSessionCookie,
  verifyGoogleCredential,
  verifyResearchVerification,
};
