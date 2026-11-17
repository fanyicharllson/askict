import type { UIMessage } from "ai";
import { currentUser } from "@/lib/server/auth";
import { deleteChat, getChat, saveChat } from "@/lib/server/chats";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to open saved chats." }, { status: 401 });
  const messages = getChat(user.id, (await params).id);
  if (!messages) return Response.json({ error: "Chat not found." }, { status: 404 });
  return Response.json({ messages });
}

/** PUT { messages }: save the current conversation (used right after a guest signs in). */
export async function PUT(req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in to save chats." }, { status: 401 });
  const { messages } = (await req.json()) as { messages: UIMessage[] };
  saveChat(user.id, (await params).id, messages);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  deleteChat(user.id, (await params).id);
  return Response.json({ ok: true });
}
