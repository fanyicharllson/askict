"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  BookOpenIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  GlobeIcon,
  RefreshCwIcon,
  SquarePenIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Composer, type VoiceLang } from "./composer";
import { Logo } from "./logo";

const SUGGESTIONS = [
  "How much is the semester fee for a bachelor student?",
  "When do the fall 2026 exams start?",
  "What is the ICTU ERP and how do I apply for my internship?",
  "Which Master's programs does ICT University offer?",
  "Quelles sont les conditions d'admission en licence ?",
  "How do I upload my payment receipt on the student portal?",
];

type SourcePart = Extract<UIMessage["parts"][number], { type: "source-url" }>;

function sourcesOf(message: UIMessage): SourcePart[] {
  return message.parts.filter((p): p is SourcePart => p.type === "source-url");
}

function textOf(message: UIMessage): string {
  return message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/** Turns "[2]" in the answer into a link to source 2, so citations are clickable. */
function linkCitations(text: string, sources: SourcePart[]): string {
  return text.replace(/\[(\d+)\](?!\()/g, (match, n: string) => {
    const s = sources[Number(n) - 1];
    return s && s.url !== "#" ? `[[${n}]](${s.url} "${s.title?.replace(/"/g, "'") ?? ""}")` : match;
  });
}

/** Only list the sources the answer actually cites; fall back to all retrieved ones. */
function citedSources(text: string, sources: SourcePart[]) {
  const cited = new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const list = sources.map((s, i) => ({ s, n: i + 1 })).filter(({ n }) => cited.has(n));
  const seen = new Set<string>();
  return list.filter(({ s }) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}

function plainText(markdown: string) {
  return markdown
    .replace(/\[(\d+)\]/g, "")
    .replace(/[*_#>`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function Chat() {
  const { messages, sendMessage, status, stop, regenerate, setMessages, error } = useChat();
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("en-US");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("fr")) setVoiceLang("fr-FR");
    return () => window.speechSynthesis?.cancel();
  }, []);

  function send(text: string) {
    sendMessage({ text });
  }

  function newChat() {
    stop();
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    setMessages([]);
  }

  async function copy(message: UIMessage) {
    await navigator.clipboard.writeText(textOf(message).replace(/\s*\[(\d+)\]/g, ""));
    setCopiedId(message.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function speak(message: UIMessage) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    if (speakingId === message.id) {
      setSpeakingId(null);
      return;
    }
    const text = plainText(textOf(message));
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[éèàùçê]|\b(les|des|est|vous|pour)\b/i.test(text) ? "fr-FR" : "en-US";
    utterance.onend = () => setSpeakingId(null);
    setSpeakingId(message.id);
    synth.speak(utterance);
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
        <Logo />
        {!empty && (
          <button
            onClick={newChat}
            className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SquarePenIcon className="size-4" /> New chat
          </button>
        )}
      </header>

      {empty ? (
        <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-10">
          <div className="w-full max-w-2xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-brand text-2xl font-black text-white shadow-lg shadow-brand/30">
                ?
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-navy dark:text-foreground sm:text-4xl">
                Ask anything about <span className="text-brand">ICT University</span>
              </h1>
              <p className="mt-3 text-muted-foreground">
                Fees, programs, admissions, the academic calendar, the ERP… Answers come from official ICTU sources, with
                citations.
              </p>
            </div>
            <Composer onSend={send} onStop={stop} busy={busy} lang={voiceLang} onLangChange={setVoiceLang} autoFocus />
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-2xl border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-brand/50 hover:bg-brand/5 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </main>
      ) : (
        <>
          <Conversation className="flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-8">
              {messages.map((message, index) => {
                const text = textOf(message);
                const isLast = index === messages.length - 1;
                if (message.role === "user") {
                  return (
                    <Message from="user" key={message.id}>
                      <MessageContent className="rounded-3xl! bg-navy! px-4! py-2.5! text-[15px] text-white!">
                        <p className="whitespace-pre-wrap">{text}</p>
                      </MessageContent>
                    </Message>
                  );
                }
                const sources = sourcesOf(message);
                const cited = citedSources(text, sources);
                const streaming = busy && isLast;
                if (!text && !streaming) return null; // e.g. the request failed before any text
                return (
                  <Message from="assistant" key={message.id} className="max-w-full">
                    <div className="flex gap-3">
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-white">
                        A
                      </div>
                      <div className="min-w-0 flex-1">
                        {text ? (
                          <MessageContent className="text-[15px] leading-relaxed">
                            <MessageResponse isAnimating={streaming}>{linkCitations(text, sources)}</MessageResponse>
                          </MessageContent>
                        ) : streaming ? (
                          <Shimmer className="text-sm">Reading ICT University sources…</Shimmer>
                        ) : null}

                        {!streaming && cited.length > 0 && (
                          <Sources className="mt-4 mb-0">
                            <SourcesTrigger count={cited.length} className="text-muted-foreground hover:text-foreground">
                              <BookOpenIcon className="size-3.5" />
                              <span className="font-medium">
                                {cited.length} source{cited.length > 1 ? "s" : ""}
                              </span>
                            </SourcesTrigger>
                            <SourcesContent>
                              {cited.map(({ s, n }) => (
                                <Source key={s.sourceId} href={s.url} title={s.title}>
                                  <span className="flex items-center gap-2 rounded-lg border px-3 py-2 text-muted-foreground hover:border-brand/50 hover:text-foreground">
                                    <span className="text-xs font-semibold text-brand">[{n}]</span>
                                    {s.url.startsWith("/docs/") ? (
                                      <FileTextIcon className="size-3.5" />
                                    ) : (
                                      <GlobeIcon className="size-3.5" />
                                    )}
                                    <span className="line-clamp-1">{s.title}</span>
                                  </span>
                                </Source>
                              ))}
                            </SourcesContent>
                          </Sources>
                        )}

                        {!streaming && text && (
                          <div className="mt-2 flex items-center gap-0.5 text-muted-foreground">
                            <IconButton label={copiedId === message.id ? "Copied" : "Copy"} onClick={() => copy(message)}>
                              {copiedId === message.id ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                            </IconButton>
                            <IconButton
                              label={speakingId === message.id ? "Stop reading" : "Read aloud"}
                              onClick={() => speak(message)}
                            >
                              {speakingId === message.id ? (
                                <VolumeXIcon className="size-4" />
                              ) : (
                                <Volume2Icon className="size-4" />
                              )}
                            </IconButton>
                            {isLast && (
                              <IconButton label="Regenerate" onClick={() => regenerate()}>
                                <RefreshCwIcon className="size-4" />
                              </IconButton>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Message>
                );
              })}

              {status === "submitted" && messages.at(-1)?.role === "user" && (
                <div className="flex gap-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-white">
                    A
                  </div>
                  <Shimmer className="text-sm">Searching ICT University sources…</Shimmer>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {error.message || "Something went wrong."}{" "}
                  <button onClick={() => regenerate()} className="font-semibold underline">
                    Try again
                  </button>
                </div>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
            <Composer onSend={send} onStop={stop} busy={busy} lang={voiceLang} onLangChange={setVoiceLang} autoFocus />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              AskICT can make mistakes. Check important information (fees, deadlines) with the university.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
