import { groq } from "@ai-sdk/groq";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { buildSystemPrompt } from "@/lib/rag/prompt";
import { search } from "@/lib/rag/store";
import { currentUser } from "@/lib/server/auth";
import { saveChat } from "@/lib/server/chats";

export const runtime = "nodejs";
export const maxDuration = 60;

// Groq runs open models very fast; free tier at https://console.groq.com/keys
const CHAT_MODEL = process.env.CHAT_MODEL ?? "openai/gpt-oss-120b";

function textOf(message: UIMessage | undefined): string {
  return (message?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

function describeError(error: unknown): string {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  if (/api key/i.test(message)) return "The AI model is not configured: add GROQ_API_KEY to .env.local.";
  if (/model_not_found|does not exist|decommissioned/i.test(message))
    return "The AI model set in CHAT_MODEL is not available on Groq anymore. Pick another one at console.groq.com/docs/models.";
  if (/quota|rate limit|429/i.test(message)) return "The AI model is busy (free quota reached). Wait a minute and try again.";
  return "Something went wrong while answering. Please try again.";
}

export async function POST(req: Request) {
  const { messages, chatId }: { messages: UIMessage[]; chatId?: string } = await req.json();
  const user = await currentUser();

  // Follow-ups like "and for masters?" need the previous question to make sense,
  // so the search query is the last user message plus the one before it.
  const userMessages = messages.filter((m) => m.role === "user");
  const query = userMessages.slice(-2).map(textOf).join("\n");

  // R — RETRIEVAL
  const hits = await search(query);

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
      const result = streamText({
        model: groq(CHAT_MODEL),
        system: buildSystemPrompt(hits),
        messages: convertToModelMessages(messages),
        temperature: 0.2,
      });
      writer.merge(result.toUIMessageStream({ onError: describeError }));
    },
    onError: describeError,
  });

  return createUIMessageStreamResponse({ stream });
}
