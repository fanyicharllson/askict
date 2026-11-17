import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

/**
 * Simple sign-in for saving chats: email or phone number + a 4-digit PIN.
 * No verification code is sent. The first sign-in with an identifier creates the account;
 * later sign-ins must use the same PIN. The session is an httpOnly cookie.
 */
export const SESSION_COOKIE = "askict_session";
const SESSION_DAYS = 30;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type User = { id: string; identifier: string };

export function normaliseIdentifier(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value;
  const digits = value.replace(/[\s().-]/g, "").replace(/^\+/, "").replace(/^00/, "");
  if (!/^\d{8,15}$/.test(digits)) return null;
  // Cameroon: "677 12 34 56", "237677123456" and "+237 677..." are the same account
  if (/^[26]\d{8}$/.test(digits)) return `+237${digits}`;
  return `+${digits}`;
}

function hashPin(pin: string, salt = randomBytes(16).toString("hex")): string {
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

function pinMatches(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const candidate = scryptSync(pin, salt, 32);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// brute-force protection: 10,000 possible PINs, so lock an identifier after a few wrong tries
const failures = new Map<string, { count: number; until: number }>();

export type SignInResult = { ok: true; user: User; created: boolean } | { ok: false; error: string };

export function signIn(rawIdentifier: string, pin: string): SignInResult {
  const identifier = normaliseIdentifier(rawIdentifier);
  if (!identifier) return { ok: false, error: "Enter a valid email address or phone number." };
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: "Your PIN must be 4 digits." };

  const lock = failures.get(identifier);
  if (lock && lock.count >= MAX_FAILED_ATTEMPTS && lock.until > Date.now()) {
    return { ok: false, error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes.` };
  }

  const db = getDb();
  const existing = db.prepare("SELECT id, identifier, pin_hash FROM users WHERE identifier = ?").get(identifier) as
    | { id: string; identifier: string; pin_hash: string }
    | undefined;

  if (existing) {
    if (!pinMatches(pin, existing.pin_hash)) {
      const count = (lock && lock.until > Date.now() ? lock.count : 0) + 1;
      failures.set(identifier, { count, until: Date.now() + LOCK_MINUTES * 60_000 });
      return { ok: false, error: "Wrong PIN for this account." };
    }
    failures.delete(identifier);
    return { ok: true, user: { id: existing.id, identifier }, created: false };
  }

  const user = { id: randomUUID(), identifier };
  db.prepare("INSERT INTO users (id, identifier, pin_hash, created_at) VALUES (?, ?, ?, ?)").run(
    user.id,
    identifier,
    hashPin(pin),
    Date.now(),
  );
  return { ok: true, user, created: true };
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  getDb().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expires),
  });
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.identifier FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(sha256(token), Date.now()) as User | undefined;
  return row ?? null;
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  store.delete(SESSION_COOKIE);
}
