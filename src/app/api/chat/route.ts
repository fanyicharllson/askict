import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { getLlm } from "@/lib/rag/llm";
import { buildSystemPrompt } from "@/lib/rag/prompt";
import { search } from "@/lib/rag/store";
import { currentUser } from "@/lib/server/auth";
import { saveChat } from "@/lib/server/chats";

export const runtime = "nodejs";
export const maxDuration = 300; // a small CPU can take a while to read the prompt

function textOf(message: UIMessage | undefined): string {
  return (message?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

function describeError(error: unknown): string {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  if (/ECONNREFUSED|fetch failed|connect/i.test(message))
    return "The local AI model is not running. Open a terminal in the askict folder and run: npm run llm";
  if (/api key/i.test(message)) return "The cloud AI model is not configured: add GROQ_API_KEY to .env.local.";
  if (/model_not_found|does not exist|decommissioned/i.test(message))
    return "The AI model set in CHAT_MODEL is not available anymore.";
  if (/quota|rate limit|429/i.test(message)) return "The AI model is busy. Wait a minute and try again.";
  if (/context|too long|exceed/i.test(message)) return "This conversation is too long for the local model. Start a new chat.";
  return "Something went wrong while answering. Please try again.";
}

export async function POST(req: Request) {
  const { messages, chatId, mode }: { messages: UIMessage[]; chatId?: string; mode?: string } = await req.json();
  const user = await currentUser();
  const llm = getLlm(mode);

  // Follow-ups like "and for masters?" need the previous question to make sense,
  // so the search query is the last user message plus the one before it.
  const userMessages = messages.filter((m) => m.role === "user");
  const query = userMessages.slice(-2).map(textOf).join("\n");

  // R — RETRIEVAL
  const hits = await search(query, llm.topK);

  const stream = createUIMessageStream({
    originalMessages: messages,
    // signed-in users: save the whole conversation once the answer is complete
    onFinish: ({ messages: finished }) => {
      if (user && chatId) saveChat(user.id, chatId, finished);
    },
    execute: async ({ writer }) => {
      // send the sources first, so the UI can show them under the answer
      hits.forEach((h, i) => {
        writer.write({
          type: "source-url",
          sourceId: String(i + 1),
          url: h.url || "#",
          title: h.title,
          providerMetadata: { askict: { score: h.score, type: h.source_type } },
        });
      });

      // A — AUGMENTATION (context in the system prompt) + G — GENERATION
      // only the recent messages are sent: a small local model reads every token on the CPU
      const recent = messages.slice(-llm.historyMessages);
      const result = streamText({
        model: llm.model,
        system: buildSystemPrompt(hits, { compact: llm.compactPrompt }),
        messages: convertToModelMessages(recent),
        temperature: llm.temperature,
      });
      writer.merge(result.toUIMessageStream({ onError: describeError }));
    },
    onError: describeError,
  });

  return createUIMessageStreamResponse({ stream });
}
