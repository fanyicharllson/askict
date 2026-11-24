import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { getLlm } from "@/lib/rag/llm";
import { estimateReadSeconds, recordReadTime, type ProgressData } from "@/lib/rag/progress";
import { buildSystemPrompt, rulesLength } from "@/lib/rag/prompt";
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

  const stream = createUIMessageStream({
    originalMessages: messages,
    // signed-in users: save the whole conversation once the answer is complete
    onFinish: ({ messages: finished }) => {
      if (user && chatId) saveChat(user.id, chatId, finished);
    },
    execute: async ({ writer }) => {
      // live progress for the UI (transient: shown while working, not saved in the chat)
      const progress = (data: ProgressData) => writer.write({ type: "data-progress", data, transient: true });
      const lastQuestion = textOf(userMessages.at(-1));

      // 0. understand the question
      const french = /[éèàùçêâô]|\b(quels?|quelles?|comment|combien|est-ce|le|la|les|des|pour|je)\b/i.test(lastQuestion);
      progress({
        id: "understand",
        state: "done",
        label: "Understood your question",
        detail: `Language: ${french ? "French" : "English"} · ${
          userMessages.length > 1 ? "follow-up, using the previous question too" : "new question"
        } · mode: ${llm.mode === "offline" ? "offline (this computer)" : "online"}`,
        ms: 0,
      });

      // R — RETRIEVAL (each sub-step reports itself)
      const labels = {
        embed: ["Turning your question into a vector", "Turned your question into a vector"],
        vector: ["Searching by meaning (vector search)", "Searched by meaning"],
        keyword: ["Searching by keywords (BM25)", "Searched by keywords"],
        rank: ["Ranking the results (Reciprocal Rank Fusion)", "Ranked the results"],
      } as const;
      const hits = await search(query, llm.topK, "student", (step) =>
        progress({ id: step.id, state: step.state, label: labels[step.id][step.state === "done" ? 1 : 0], detail: step.detail, ms: step.ms }),
      );
      const titles = [...new Set(hits.map((h) => h.title))];
      progress({
        id: "sources",
        state: "done",
        label: `Picked ${hits.length} passage${hits.length === 1 ? "" : "s"} from ${titles.length} source${titles.length === 1 ? "" : "s"}`,
        detail: titles.slice(0, 3).join(" · ") + (titles.length > 3 ? ` · +${titles.length - 3} more` : ""),
        ms: 0,
      });

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
      const system = buildSystemPrompt(hits, { compact: llm.compactPrompt });

      // estimate how long the model needs to READ the new part of the prompt
      const newChars = system.length - rulesLength(llm.compactPrompt) + recent.map(textOf).join(" ").length;
      const tokens = Math.round(newChars / 3.6);
      progress({
        id: "prompt",
        state: "done",
        label: "Prepared the prompt",
        detail: `rules + ${hits.length} numbered passages + ${recent.length} message${recent.length === 1 ? "" : "s"} · about ${tokens} new tokens${
          llm.compactPrompt ? " (rules already cached)" : ""
        }`,
        ms: 0,
      });
      const eta = estimateReadSeconds(llm.mode, newChars);
      progress({
        id: "read",
        state: "active",
        label: llm.mode === "offline" ? "Reading the passages on this computer" : "Reading the passages",
        detail: `${llm.label} · ${tokens} tokens`,
        etaSeconds: eta,
      });
      const readStarted = Date.now();
      let writeStarted = 0;

      const result = streamText({
        model: llm.model,
        system,
        messages: convertToModelMessages(recent),
        temperature: llm.temperature,
        onChunk: ({ chunk }) => {
          if (writeStarted || chunk.type !== "text-delta") return;
          writeStarted = Date.now();
          const seconds = (writeStarted - readStarted) / 1000;
          recordReadTime(llm.mode, newChars, seconds);
          progress({
            id: "read",
            state: "done",
            label: "Read the passages",
            detail: `${tokens} tokens · about ${Math.round(tokens / Math.max(seconds, 0.1))} tokens/s`,
            ms: writeStarted - readStarted,
          });
          progress({ id: "write", state: "active", label: "Writing the answer", detail: `${llm.label}` });
        },
        onFinish: ({ text, usage }) => {
          const seconds = writeStarted ? (Date.now() - writeStarted) / 1000 : 0;
          const words = text.trim().split(/\s+/).filter(Boolean).length;
          const out = usage?.outputTokens;
          progress({
            id: "write",
            state: "done",
            label: "Wrote the answer",
            detail: `${words} words${out ? ` · ${out} tokens` : ""}${seconds ? ` · ${(words / seconds).toFixed(1)} words/s` : ""}`,
            ms: Math.round(seconds * 1000),
          });
        },
      });
      writer.merge(result.toUIMessageStream({ onError: describeError }));
    },
    onError: describeError,
  });

  return createUIMessageStreamResponse({ stream });
}
