import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

/**
 * GENERATION model. Two modes, chosen per question by the toggle in the chat input:
 *
 *  - "offline" (default): LFM3-1.7B on this laptop through llama.cpp (`npm run llm`).
 *    No API key, no internet. Tuned for a small CPU: 4 short passages, compact rules, short history.
 *  - "online" (optional): a cloud model on Groq (needs GROQ_API_KEY in .env.local).
 */
export type LlmMode = "offline" | "online";

export type LlmConfig = {
  mode: LlmMode;
  model: LanguageModel;
  label: string;
  topK: number; // passages sent to the model
  historyMessages: number; // how many previous messages the model sees
  temperature: number;
  compactPrompt: boolean;
};

export const onlineAvailable = () => Boolean(process.env.GROQ_API_KEY);

export function getLlm(requested?: string): LlmConfig {
  const mode: LlmMode = requested === "online" && onlineAvailable() ? "online" : "offline";
  if (mode === "online") {
    const id = process.env.CHAT_MODEL ?? "openai/gpt-oss-120b";
    return {
      mode,
      model: createGroq()(id),
      label: `${id} (Groq, online)`,
      topK: 8,
      historyMessages: 12,
      temperature: 0.2,
      compactPrompt: false,
    };
  }
  const local = createOpenAICompatible({
    name: "llamacpp",
    baseURL: process.env.LOCAL_LLM_URL ?? "http://127.0.0.1:8080/v1",
  });
  return {
    mode,
    model: local.chatModel("lfm3"),
    label: "LFM3-1.7B (offline, llama.cpp)",
    topK: Number(process.env.LOCAL_TOP_K ?? 4),
    historyMessages: 4,
    temperature: 0.1,
    compactPrompt: true,
  };
}
