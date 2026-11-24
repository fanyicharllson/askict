import { onlineAvailable } from "@/lib/rag/llm";

/** Tells the chat UI whether the "Online" mode can be offered (a cloud key is configured). */
export function GET() {
  return Response.json({ onlineAvailable: onlineAvailable() });
}
