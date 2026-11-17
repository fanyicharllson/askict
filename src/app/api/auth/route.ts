import { currentUser, endSession, signIn, startSession } from "@/lib/server/auth";

export const runtime = "nodejs";

/** GET: who is signed in (null for guests). */
export async function GET() {
  return Response.json({ user: await currentUser() });
}

/** POST { identifier, pin }: sign in, or create the account on first use. */
export async function POST(req: Request) {
  const { identifier, pin } = (await req.json().catch(() => ({}))) as { identifier?: string; pin?: string };
  const result = signIn(String(identifier ?? ""), String(pin ?? ""));
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  await startSession(result.user.id);
  return Response.json({ user: result.user, created: result.created });
}

/** DELETE: sign out. */
export async function DELETE() {
  await endSession();
  return Response.json({ ok: true });
}
