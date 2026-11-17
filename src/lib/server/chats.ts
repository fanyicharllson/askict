import type { UIMessage } from "ai";
import { getDb } from "./db";

export type ChatSummary = { id: string; title: string; updatedAt: number };

function titleFrom(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === "user");
  const text = (first?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text || "New chat";
}

export function saveChat(userId: string, chatId: string, messages: UIMessage[]) {
  if (!/^[\w-]{6,64}$/.test(chatId) || messages.length === 0) return;
  const now = Date.now();
  const db = getDb();
  const owner = db.prepare("SELECT user_id FROM chats WHERE id = ?").get(chatId) as { user_id: string } | undefined;
  if (owner && owner.user_id !== userId) return; // never overwrite someone else's chat
  db.prepare(
    `INSERT INTO chats (id, user_id, title, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET messages = excluded.messages, title = excluded.title, updated_at = excluded.updated_at`,
  ).run(chatId, userId, titleFrom(messages), JSON.stringify(messages), now, now);
}

export function listChats(userId: string): ChatSummary[] {
  return (
    getDb()
      .prepare("SELECT id, title, updated_at FROM chats WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100")
      .all(userId) as { id: string; title: string; updated_at: number }[]
  ).map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

export function getChat(userId: string, chatId: string): UIMessage[] | null {
  const row = getDb().prepare("SELECT messages FROM chats WHERE id = ? AND user_id = ?").get(chatId, userId) as
    | { messages: string }
    | undefined;
  return row ? (JSON.parse(row.messages) as UIMessage[]) : null;
}

export function deleteChat(userId: string, chatId: string) {
  getDb().prepare("DELETE FROM chats WHERE id = ? AND user_id = ?").run(chatId, userId);
}
