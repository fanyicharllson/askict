/**
 * Live progress for the chat UI.
 *
 * The slow part on a laptop CPU is the model READING the prompt (prefill) before it writes
 * the first word. We estimate that time from the prompt size and a reading speed that is
 * LEARNED from real answers (exponential moving average), so estimates improve with use.
 */
export type ProgressData = {
  id: string; // understand | embed | vector | keyword | rank | sources | prompt | read | write
  state: "active" | "done";
  label: string;
  detail?: string;
  etaSeconds?: number; // only for "read": estimated reading time
  ms?: number; // how long a finished step took
};

// characters of NEW prompt text read per second; start from what we measured on a 2-core i5
const speed: Record<string, number> = { offline: 110, online: 4000 };
const SMOOTHING = 0.35;

export function estimateReadSeconds(mode: string, newChars: number): number {
  const cps = speed[mode] ?? speed.offline;
  return Math.max(1, Math.round(newChars / cps));
}

/** Called when the first word arrives: updates the learned reading speed. */
export function recordReadTime(mode: string, newChars: number, seconds: number) {
  if (seconds <= 0.2 || newChars < 200) return;
  const measured = newChars / seconds;
  speed[mode] = (speed[mode] ?? measured) * (1 - SMOOTHING) + measured * SMOOTHING;
}
