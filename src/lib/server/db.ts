import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR } from "@/lib/rag/config";

/**
 * App database (users, sessions, saved chats): one SQLite file on this laptop, data/app.db.
 * Uses Node's built-in SQLite, so nothing to install. Separate from the vector database.
 */
let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "app.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      identifier  TEXT NOT NULL UNIQUE,   -- normalised email or phone number
      pin_hash    TEXT NOT NULL,          -- scrypt(salt, pin)
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,       -- sha256 of the cookie value
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      messages    TEXT NOT NULL,          -- JSON array of UI messages
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chats_user ON chats(user_id, updated_at DESC);
  `);
  return db;
}
