"use client";

import { CheckIcon, ChevronDownIcon, LoaderCircleIcon, SparklesIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type ProgressData = {
  id: string;
  state: "active" | "done";
  label: string;
  detail?: string;
  etaSeconds?: number;
  ms?: number;
};
export type ProgressItem = ProgressData & { at: number };
/** Ordered list of steps, in the order the server reported them. */
export type ProgressState = ProgressItem[];

export function applyProgress(list: ProgressState, data: ProgressData): ProgressState {
  const i = list.findIndex((s) => s.id === data.id);
  if (i < 0) return [...list, { ...data, at: Date.now() }];
  const next = [...list];
  next[i] = { ...next[i], ...data, at: data.state === "done" ? next[i].at : Date.now() };
  return next;
}

function formatSeconds(s: number) {
  if (s < 1) return `${Math.max(0, Math.round(s * 1000))}ms`;
  const sec = Math.round(s);
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, "0")}s`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

type Props = {
  steps: ProgressState;
  startedAt: number;
  live: boolean; // still working
  finishedAt?: number;
  sourcesCount?: number;
  liveWords?: number; // words written so far (while writing)
};

/**
 * "What the assistant is doing" panel. While working it lists every real step live
 * (vector search, keyword search, ranking, reading on this computer with a countdown,
 * writing with live speed). When done it folds into a one-line summary you can reopen.
 */
export function ProgressSteps({ steps, startedAt, live, finishedAt, sourcesCount, liveWords }: Props) {
  const [open, setOpen] = useState(live);
  useEffect(() => setOpen(live), [live]);
  const now = useNow(live);
  const total = ((live ? now : (finishedAt ?? now)) - startedAt) / 1000;

  if (!steps.length && !live) return null;

  return (
    <div className="fade-in mb-3 w-full max-w-xl rounded-2xl border border-brand/15 bg-brand-soft/40 text-sm">
      <button
        type="button"
        onClick={() => !live && setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-2 px-3.5 py-2.5 text-left", !live && "cursor-pointer")}
        aria-expanded={open}
      >
        {live ? (
          <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-brand" />
        ) : (
          <SparklesIcon className="size-4 shrink-0 text-brand" />
        )}
        <span className="flex-1 font-semibold text-brand-strong">
          {live
            ? (steps.findLast((s) => s.state === "active")?.label ?? "Starting") + "…"
            : `Answered in ${formatSeconds(total)} · ${steps.length} steps${sourcesCount ? ` · ${sourcesCount} sources` : ""}`}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink/55">{live && formatSeconds(total)}</span>
        {!live && (
          <ChevronDownIcon className={cn("size-4 shrink-0 text-ink/50 transition-transform duration-200", open && "rotate-180")} />
        )}
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <ol className="min-h-0 space-y-2.5 overflow-hidden px-3.5">
          {steps.map((s, idx) => {
            const active = s.state === "active" && live;
            let pct = 0;
            let left: string | null = null;
            if (active && s.etaSeconds) {
              const spent = (now - s.at) / 1000;
              pct = Math.min(96, (spent / s.etaSeconds) * 100);
              const remaining = s.etaSeconds - spent;
              left = remaining > 1 ? `about ${formatSeconds(remaining)} left` : "almost done…";
            }
            const detail =
              active && s.id === "write" && liveWords
                ? `${liveWords} words so far · ${(liveWords / Math.max(0.5, (now - s.at) / 1000)).toFixed(1)} words/s`
                : s.detail;
            return (
              <li key={s.id} className={cn("rise-in flex gap-2.5", idx === steps.length - 1 && "pb-3")}>
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                    active ? "text-brand" : "bg-brand text-white",
                  )}
                >
                  {active ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CheckIcon className="size-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("font-medium text-ink", active && "text-brand-strong")}>
                      {s.label}
                      {active && "…"}
                    </span>
                    {left ? (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-brand">{left}</span>
                    ) : active ? (
                      <span className="shrink-0 text-xs tabular-nums text-ink/50">{formatSeconds((now - s.at) / 1000)}</span>
                    ) : s.ms ? (
                      <span className="shrink-0 text-xs tabular-nums text-ink/50">{formatSeconds(s.ms / 1000)}</span>
                    ) : null}
                  </div>
                  {detail && <p className="mt-0.5 text-xs leading-relaxed text-ink/60">{detail}</p>}
                  {active && s.etaSeconds ? (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand/15">
                      <div
                        className="h-full rounded-full bg-brand transition-[width] duration-300 ease-linear"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
