"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  BookOpenIcon,
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  FlagIcon,
  GlobeIcon,
  MenuIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SquarePenIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { cn } from "@/lib/utils";
import { Composer, type VoiceLang } from "./composer";
import { LogoMark, Orb } from "./logo";
import { Sidebar, TOPICS, type ChatSummary } from "./sidebar";
import { SignInDialog, type SessionUser } from "./sign-in-dialog";
import { generalReportLink, reportAnswerLink } from "./support";

const STARTERS = [
  { ...TOPICS[0], title: "Fees & payments", question: "How much is the semester fee for a bachelor student, and when are the installments due?" },
  { ...TOPICS[2], title: "Academic calendar", question: "When do the fall 2026 exams start and end?" },
  { ...TOPICS[1], title: "Programs", question: "Which Master's programs does ICT University offer?" },
];
const CHIPS = [
  "What is the ICTU ERP?",
  "How do I upload my payment receipt?",
  "Conditions d'admission en licence ?",
  "How much is a full transcript?",
];

type SourcePart = Extract<UIMessage["parts"][number], { type: "source-url" }>;

const newId = () => crypto.randomUUID();
const sourcesOf = (m: UIMessage) => m.parts.filter((p): p is SourcePart => p.type === "source-url");
const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

/** Turns "[2]" in the answer into a link to source 2, so citations are clickable. */
function linkCitations(text: string, sources: SourcePart[]): string {
  return text.replace(/\[(\d+)\](?!\()/g, (match, n: string) => {
    const s = sources[Number(n) - 1];
    return s && s.url !== "#" ? `[[${n}]](${s.url} "${s.title?.replace(/"/g, "'") ?? ""}")` : match;
  });
}

/** Only list the sources the answer actually cites, once each. */
function citedSources(text: string, sources: SourcePart[]) {
  const cited = new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const seen = new Set<string>();
  return sources
    .map((s, i) => ({ s, n: i + 1 }))
    .filter(({ n, s }) => cited.has(n) && !seen.has(s.url) && (seen.add(s.url), true));
}

const plainText = (md: string) => md.replace(/\[(\d+)\]/g, "").replace(/[*_#>`|]/g, " ").replace(/\s+/g, " ").trim();

export function Chat() {
  const chatIdRef = useRef<string>("");
  const [chatId, setChatId] = useState("");
  const [transport] = useState(
    () => new DefaultChatTransport({ api: "/api/chat", body: () => ({ chatId: chatIdRef.current }) }),
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [signInOpen, setSignInOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("en-US");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const refreshChats = useCallback(async () => {
    const res = await fetch("/api/chats");
    if (res.ok) setChats((await res.json()).chats);
  }, []);

  const { messages, sendMessage, status, stop, regenerate, setMessages, error } = useChat({
    transport,
    onFinish: () => {
      if (user) void refreshChats();
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  function selectChat(id: string) {
    chatIdRef.current = id;
    setChatId(id);
  }

  useEffect(() => {
    selectChat(newId());
    if (navigator.language.toLowerCase().startsWith("fr")) setVoiceLang("fr-FR");
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        setUser(d.user);
        if (d.user) void refreshChats();
      })
      .catch(() => {});
    return () => window.speechSynthesis?.cancel();
  }, [refreshChats]);

  function send(text: string) {
    setDrawerOpen(false);
    sendMessage({ text });
  }

  function newChat() {
    stop();
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    setMessages([]);
    selectChat(newId());
    setDrawerOpen(false);
  }

  async function openChat(id: string) {
    if (id === chatId) return setDrawerOpen(false);
    stop();
    const res = await fetch(`/api/chats/${id}`);
    if (!res.ok) return;
    setMessages((await res.json()).messages);
    selectChat(id);
    setDrawerOpen(false);
  }

  async function removeChat(id: string) {
    await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (id === chatId) newChat();
    void refreshChats();
  }

  async function onSignedIn(u: SessionUser) {
    setUser(u);
    setSignInOpen(false);
    // a guest who signs in mid-conversation keeps this chat
    if (messages.length > 0) {
      await fetch(`/api/chats/${chatId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
    }
    void refreshChats();
  }

  async function signOut() {
    await fetch("/api/auth", { method: "DELETE" });
    setUser(null);
    setChats([]);
    newChat();
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
    if (speakingId === message.id) return setSpeakingId(null);
    const text = plainText(textOf(message));
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[éèàùçê]|\b(les|des|est|vous|pour)\b/i.test(text) ? "fr-FR" : "en-US";
    utterance.onend = () => setSpeakingId(null);
    setSpeakingId(message.id);
    synth.speak(utterance);
  }

  const sidebarProps = {
    user,
    chats,
    activeChatId: chatId,
    onNewChat: newChat,
    onOpenChat: openChat,
    onDeleteChat: removeChat,
    onAsk: send,
    onSignIn: () => setSignInOpen(true),
    onSignOut: signOut,
  };

  return (
    <div className="flex h-dvh bg-canvas md:gap-2 md:p-2">
      <Sidebar {...sidebarProps} className="hidden md:flex" />

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <Sidebar {...sidebarProps} className="relative bg-canvas shadow-xl" onClose={() => setDrawerOpen(false)} />
        </div>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-white md:rounded-3xl md:border md:border-black/5 md:shadow-sm">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-black/5 px-3 sm:px-5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex size-9 items-center justify-center rounded-lg hover:bg-muted md:hidden"
              aria-label="Open menu"
            >
              <MenuIcon className="size-5" />
            </button>
            <span className="flex items-center gap-2 rounded-full border border-black/10 py-1 pr-3 pl-1.5 text-sm font-semibold text-ink">
              <LogoMark className="size-6" /> ICT University assistant
            </span>
            <span className="hidden items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand lg:flex">
              <ShieldCheckIcon className="size-3.5" /> Answers from official ICTU sources
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={generalReportLink()}
              target="_blank"
              rel="noreferrer"
              className="hidden h-9 items-center gap-1.5 rounded-xl border border-black/10 px-3 text-sm font-medium text-ink/80 transition-colors hover:bg-muted sm:flex"
            >
              <FlagIcon className="size-4 text-gold" /> Report an issue
            </a>
            {!empty && (
              <button
                onClick={newChat}
                className="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 px-3 text-sm font-medium text-ink/80 transition-colors hover:bg-muted md:hidden"
              >
                <SquarePenIcon className="size-4" /> New
              </button>
            )}
            {user ? (
              <span
                className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand uppercase"
                title={`Signed in as ${user.identifier}`}
              >
                {user.identifier.replace(/^\+/, "").charAt(0)}
              </span>
            ) : (
              <button
                onClick={() => setSignInOpen(true)}
                className="h-9 rounded-xl bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
              >
                Sign in
              </button>
            )}
          </div>
        </header>

        {empty ? (
          <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-2/3 bg-[radial-gradient(60%_60%_at_50%_30%,rgba(201,154,46,0.10),transparent)]" />
            <div className="relative w-full max-w-2xl">
              <Orb />
              <div className="mt-6 text-center">
                <p className="bg-gradient-to-r from-brand to-gold bg-clip-text text-2xl font-bold text-transparent sm:text-3xl">
                  {user ? "Welcome back" : "Hello, ICTU"}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-[32px]">What would you like to know?</h1>
              </div>
              <div className="mt-8">
                <Composer onSend={send} onStop={stop} busy={busy} lang={voiceLang} onLangChange={setVoiceLang} autoFocus />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {STARTERS.map(({ icon: Icon, title, question }) => (
                  <button
                    key={title}
                    onClick={() => send(question)}
                    className="group rounded-2xl border border-black/10 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
                  >
                    <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                      <Icon className="size-4" />
                    </span>
                    <p className="mt-3 text-sm font-bold text-ink">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{question}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    onClick={() => send(c)}
                    className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-ink/70 transition-colors hover:border-gold/50 hover:bg-gold-soft hover:text-ink"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <Conversation className="flex-1">
              <ConversationContent className="mx-auto w-full max-w-3xl gap-7 px-4 py-8">
                {messages.map((message, index) => {
                  const text = textOf(message);
                  const isLast = index === messages.length - 1;
                  if (message.role === "user") {
                    return (
                      <Message from="user" key={message.id}>
                        <MessageContent className="rounded-2xl! rounded-br-md! bg-ink! px-4! py-2.5! text-[15px] text-white!">
                          <p className="whitespace-pre-wrap">{text}</p>
                        </MessageContent>
                      </Message>
                    );
                  }
                  const sources = sourcesOf(message);
                  const cited = citedSources(text, sources);
                  const streaming = busy && isLast;
                  if (!text && !streaming) return null; // e.g. the request failed before any text
                  const question = textOf(messages[index - 1] ?? message);
                  return (
                    <Message from="assistant" key={message.id} className="max-w-full">
                      <div className="flex gap-3">
                        <LogoMark className="mt-0.5 size-7" />
                        <div className="min-w-0 flex-1">
                          {text ? (
                            <MessageContent className="text-[15px] leading-relaxed text-ink">
                              <MessageResponse isAnimating={streaming}>{linkCitations(text, sources)}</MessageResponse>
                            </MessageContent>
                          ) : (
                            <Shimmer className="text-sm">Reading ICT University sources…</Shimmer>
                          )}

                          {!streaming && cited.length > 0 && (
                            <Sources className="mt-4 mb-0">
                              <SourcesTrigger count={cited.length} className="text-xs font-semibold text-brand hover:text-brand-strong">
                                <BookOpenIcon className="size-3.5" />
                                {cited.length} source{cited.length > 1 ? "s" : ""}
                              </SourcesTrigger>
                              <SourcesContent>
                                {cited.map(({ s, n }) => (
                                  <Source key={s.sourceId} href={s.url} title={s.title}>
                                    <span className="flex items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-ink/70 transition-colors hover:border-brand/40 hover:text-ink">
                                      <span className="text-xs font-bold text-gold">[{n}]</span>
                                      {s.url.startsWith("/docs/") ? <FileTextIcon className="size-3.5" /> : <GlobeIcon className="size-3.5" />}
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
                              <IconButton label={speakingId === message.id ? "Stop reading" : "Read aloud"} onClick={() => speak(message)}>
                                {speakingId === message.id ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
                              </IconButton>
                              {isLast && (
                                <IconButton label="Regenerate" onClick={() => regenerate()}>
                                  <RefreshCwIcon className="size-4" />
                                </IconButton>
                              )}
                              <a
                                href={reportAnswerLink(question, plainText(text))}
                                target="_blank"
                                rel="noreferrer"
                                title="Report a wrong answer on WhatsApp"
                                aria-label="Report a wrong answer on WhatsApp"
                                className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-ink"
                              >
                                <FlagIcon className="size-4" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </Message>
                  );
                })}

                {status === "submitted" && messages.at(-1)?.role === "user" && (
                  <div className="flex gap-3">
                    <LogoMark className="size-7" />
                    <Shimmer className="text-sm">Searching ICT University sources…</Shimmer>
                  </div>
                )}

                {error && (
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
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
              <p className={cn("mt-2 text-center text-xs text-muted-foreground")}>
                {user ? (
                  "This chat is saved to your account."
                ) : (
                  <>
                    Guest chat, not saved.{" "}
                    <button onClick={() => setSignInOpen(true)} className="font-semibold text-brand hover:underline">
                      Sign in to save it
                    </button>
                    {" · "}
                  </>
                )}
                {!user && "Check important info (fees, deadlines) with the university."}
              </p>
            </div>
          </>
        )}
      </main>

      <SignInDialog open={signInOpen} onClose={() => setSignInOpen(false)} onSignedIn={onSignedIn} />
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-ink"
    >
      {children}
    </button>
  );
}
