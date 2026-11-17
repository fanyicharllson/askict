import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { buildSystemPrompt } from "@/lib/rag/prompt";
import { search } from "@/lib/rag/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHAT_MODEL = process.env.CHAT_MODEL ?? "gemini-2.5-flash";

function textOf(message: UIMessage | undefined): string {
  return (message?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

function describeError(error: unknown): string {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  if (/api key/i.test(message)) return "The AI model is not configured: add GOOGLE_GENERATIVE_AI_API_KEY to .env.local.";
  if (/quota|rate limit|429/i.test(message)) return "The AI model is busy (free quota reached). Wait a minute and try again.";
  return "Something went wrong while answering. Please try again.";
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Follow-ups like "and for masters?" need the previous question to make sense,
  // so the search query is the last user message plus the one before it.
  const userMessages = messages.filter((m) => m.role === "user");
  const query = userMessages.slice(-2).map(textOf).join("\n");

  // R — RETRIEVAL
  const hits = await search(query);

  const stream = createUIMessageStream({
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
        model: google(CHAT_MODEL),
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
