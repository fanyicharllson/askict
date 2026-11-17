"use client";

import {
  BookmarkIcon,
  CalendarDaysIcon,
  GraduationCapIcon,
  LogOutIcon,
  MessageCircleWarningIcon,
  MonitorSmartphoneIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import type { SessionUser } from "./sign-in-dialog";
import { generalReportLink } from "./support";

export type ChatSummary = { id: string; title: string; updatedAt: number };

export const TOPICS = [
  { icon: WalletIcon, label: "Fees & payments", question: "What are the tuition fees and payment deadlines at ICT University?" },
  { icon: GraduationCapIcon, label: "Programs", question: "Which Bachelor's and Master's programs does ICT University offer?" },
  { icon: CalendarDaysIcon, label: "Academic calendar", question: "What is the academic calendar for the 2026-2027 fall semester?" },
  { icon: MonitorSmartphoneIcon, label: "ICTU ERP", question: "What is the ICTU ERP and what do final year students need to do on it?" },
];

function groupByDay(chats: ChatSummary[]) {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const groups: { label: string; items: ChatSummary[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const c of chats) {
    if (c.updatedAt >= startOfToday) groups[0].items.push(c);
    else if (c.updatedAt >= startOfToday - 86_400_000) groups[1].items.push(c);
    else if (c.updatedAt >= startOfToday - 7 * 86_400_000) groups[2].items.push(c);
    else groups[3].items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

type Props = {
  user: SessionUser | null;
  chats: ChatSummary[];
  activeChatId: string;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onAsk: (question: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
  className?: string;
  onClose?: () => void;
};

export function Sidebar(props: Props) {
  const { user, chats, activeChatId, onNewChat, onOpenChat, onDeleteChat, onAsk, onSignIn, onSignOut, className, onClose } = props;
  const [query, setQuery] = useState("");
  const groups = useMemo(
    () => groupByDay(chats.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))),
    [chats, query],
  );

  return (
    <aside className={cn("flex h-full w-[264px] shrink-0 flex-col", className)}>
      <div className="flex h-14 items-center justify-between px-3">
        <Logo />
        {onClose && (
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-lg hover:bg-black/5" aria-label="Close menu">
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      <div className="px-3">
        <button
          onClick={onNewChat}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong"
        >
          <PlusIcon className="size-4" /> New chat
        </button>
        {user && (
          <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border bg-white px-3 text-sm text-muted-foreground focus-within:border-brand">
            <SearchIcon className="size-4" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full bg-transparent text-ink outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
      </div>

      <nav className="mt-4 px-3">
        <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Topics</p>
        {TOPICS.map(({ icon: Icon, label, question }) => (
          <button
            key={label}
            onClick={() => onAsk(question)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-ink/80 transition-colors hover:bg-black/5 hover:text-ink"
          >
            <Icon className="size-4 text-brand" /> {label}
          </button>
        ))}
      </nav>

      <div className="mx-3 my-3 border-t border-black/5" />

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {user ? (
          groups.length ? (
            groups.map((g) => (
              <div key={g.label} className="mb-3">
                <p className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{g.label}</p>
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center rounded-lg transition-colors hover:bg-black/5",
                      c.id === activeChatId && "bg-white shadow-sm hover:bg-white",
                    )}
                  >
                    <button onClick={() => onOpenChat(c.id)} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-ink/85">
                      {c.title}
                    </button>
                    <button
                      onClick={() => onDeleteChat(c.id)}
                      className="mr-1 hidden size-7 items-center justify-center rounded-md text-muted-foreground group-hover:flex hover:text-destructive"
                      aria-label={`Delete chat: ${c.title}`}
                      title="Delete chat"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="px-2 text-sm text-muted-foreground">{query ? "No chat matches your search." : "Your saved chats will appear here."}</p>
          )
        ) : (
          <div className="rounded-2xl border border-gold/30 bg-gold-soft/60 p-4">
            <BookmarkIcon className="size-5 text-gold" />
            <p className="mt-2 text-sm font-bold text-ink">Keep your answers</p>
            <p className="mt-1 text-xs leading-relaxed text-ink/70">
              You can ask without an account. Sign in with your email or phone to save your chats and find them later.
            </p>
            <button
              onClick={onSignIn}
              className="mt-3 h-8 w-full rounded-lg bg-brand text-xs font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              Sign in to save chats
            </button>
          </div>
        )}
      </div>

      <div className="p-3">
        <a
          href={generalReportLink()}
          target="_blank"
          rel="noreferrer"
          className="mb-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-ink/70 transition-colors hover:bg-black/5 hover:text-ink"
        >
          <MessageCircleWarningIcon className="size-4 text-gold" /> Report an issue
        </a>
        {user && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-white p-2.5 shadow-sm">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand uppercase">
              {user.identifier.replace(/^\+/, "").charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{user.identifier}</p>
              <p className="text-xs text-muted-foreground">Chats are saved</p>
            </div>
            <button
              onClick={onSignOut}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-black/5 hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOutIcon className="size-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
