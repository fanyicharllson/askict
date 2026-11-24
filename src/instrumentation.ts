/**
 * Runs once when the server starts: loads the embedding model and opens the vector
 * database in the background, so the first student question doesn't pay for it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { search } = await import("@/lib/rag/store");
  search("warm up", 1)
    .then(() => console.log("[askict] retrieval warmed up"))
    .catch((err) => console.warn("[askict] warm-up skipped:", err instanceof Error ? err.message : err));
}
