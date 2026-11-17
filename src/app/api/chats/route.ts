import { currentUser } from "@/lib/server/auth";
import { listChats } from "@/lib/server/chats";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ chats: [] });
  return Response.json({ chats: listChats(user.id) });
}
