/**
 * Starts the LOCAL language model: llama.cpp's llama-server running LFM3-1.7B (4-bit, ~1 GB).
 * No API key, no internet. AskICT talks to it at http://127.0.0.1:8080/v1 (OpenAI-compatible).
 *
 * Run: npm run llm      (keep this terminal open, then `npm run dev` in another one)
 *
 * Paths can be changed with LLAMA_SERVER and LLM_MODEL_PATH env variables.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const exe =
  process.env.LLAMA_SERVER ??
  path.join(root, "tools", "llama.cpp", process.platform === "win32" ? "llama-server.exe" : "llama-server");
const model = process.env.LLM_MODEL_PATH ?? path.join(root, "data", "models", "llm", "LFM3-1.7B-Q4_K_M.gguf");

for (const [what, file, hint] of [
  ["llama-server", exe, "download llama.cpp from https://github.com/ggml-org/llama.cpp/releases (win-cpu-x64 zip) into tools/llama.cpp/"],
  ["model", model, "download LFM3-1.7B-Q4_K_M.gguf from https://huggingface.co/LiquidAI/LFM3-1.7B-GGUF into data/models/llm/"],
]) {
  if (!existsSync(file)) {
    console.error(`Missing ${what}: ${file}\n  -> ${hint}`);
    process.exit(1);
  }
}

const threads = String(Math.max(1, os.cpus().length));
const args = [
  "-m", model,
  "--alias", "lfm3",
  "--host", "127.0.0.1",
  "--port", process.env.LLM_PORT ?? "8080",
  "-c", "8192", // context window: rules + retrieved passages + recent conversation
  "-np", "1", // one conversation at a time: all CPU power goes to it
  "-t", threads,
  "--reasoning", "off", // LFM3 "thinks" by default; on a laptop CPU we want the answer directly
  "--temp", "0.1", // sampling recommended by LiquidAI for LFM3
  "--top-k", "50",
  "--repeat-penalty", "1.1",
  "--no-webui",
];

console.log(`Starting local LLM (LFM3-1.7B) on http://127.0.0.1:${process.env.LLM_PORT ?? "8080"} with ${threads} threads...`);
const child = spawn(exe, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
