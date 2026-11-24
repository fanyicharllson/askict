"use client";

import { ArrowUpIcon, CloudIcon, HardDriveIcon, MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

/* Minimal typings for the browser Web Speech API (Chrome/Edge expose it as webkitSpeechRecognition). */
type SpeechRecognitionResultLike = { 0: { transcript: string }; isFinal: boolean };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceLang = "en-US" | "fr-FR";
export type ModelMode = "offline" | "online";

type Props = {
  onSend: (text: string) => void;
  onStop: () => void;
  busy: boolean;
  lang: VoiceLang;
  onLangChange: (lang: VoiceLang) => void;
  mode: ModelMode;
  onModeChange: (mode: ModelMode) => void;
  onlineAvailable: boolean;
  autoFocus?: boolean;
};

export function Composer(props: Props) {
  const { onSend, onStop, busy, lang, onLangChange, mode, onModeChange, onlineAvailable, autoFocus } = props;
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const baseText = useRef("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setVoiceSupported(getRecognitionCtor() !== null), []);

  // grow the textarea with its content (up to ~8 lines)
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    recognition.current?.stop();
    onSend(value);
    setText("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  }

  function toggleVoice() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    baseText.current = text ? `${text.trimEnd()} ` : "";
    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setText(baseText.current + finalText + interim);
    };
    rec.onerror = (e) => {
      setVoiceError(e.error === "not-allowed" ? "Microphone access was blocked." : "Voice input stopped. Try again.");
    };
    rec.onend = () => {
      setListening(false);
      textarea.current?.focus();
    };
    setVoiceError(null);
    recognition.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={cn(
          "rounded-2xl border border-black/10 bg-white/90 shadow-[0_8px_30px_rgba(16,36,26,0.07)] backdrop-blur transition-all focus-within:border-brand/40 focus-within:shadow-[0_8px_30px_color-mix(in_oklch,var(--brand)_18%,transparent)]",
          listening && "border-brand ring-2 ring-brand/30",
        )}
      >
        <textarea
          ref={textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          autoFocus={autoFocus}
          placeholder={listening ? (lang === "fr-FR" ? "Je vous écoute…" : "Listening…") : "Ask anything about ICT University…"}
          className="block max-h-[200px] w-full resize-none bg-transparent px-5 pt-4 pb-2 text-base text-ink caret-brand outline-none placeholder:text-muted-foreground sm:text-[15px]"
          aria-label="Your question"
        />
        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <div className="flex items-center gap-1">
            {voiceSupported && (
              <>
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    listening && "bg-brand text-white hover:bg-brand hover:text-white animate-pulse",
                  )}
                  aria-label={listening ? "Stop voice input" : "Speak your question"}
                  title={listening ? "Stop voice input" : "Speak your question"}
                >
                  <MicIcon className="size-[18px]" />
                </button>
                <button
                  type="button"
                  onClick={() => onLangChange(lang === "en-US" ? "fr-FR" : "en-US")}
                  className="h-7 rounded-full border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Voice language"
                  aria-label={`Voice language: ${lang === "en-US" ? "English" : "French"}. Click to switch.`}
                >
                  {lang === "en-US" ? "EN" : "FR"}
                </button>
              </>
            )}
            <div
              role="radiogroup"
              aria-label="AI model"
              className="ml-1 flex h-7 items-center rounded-full border p-0.5 text-xs font-semibold"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === "offline"}
                onClick={() => onModeChange("offline")}
                title="Offline: the AI runs on this computer (LFM3-1.7B). No internet needed."
                className={cn(
                  "flex h-full items-center gap-1 rounded-full px-2.5 transition-colors",
                  mode === "offline" ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <HardDriveIcon className="size-3.5" /> Offline
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "online"}
                disabled={!onlineAvailable}
                onClick={() => onModeChange("online")}
                title={
                  onlineAvailable
                    ? "Online: a larger cloud model (Groq). Faster, needs internet."
                    : "Online mode is off: no cloud API key is configured."
                }
                className={cn(
                  "flex h-full items-center gap-1 rounded-full px-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  mode === "online" ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CloudIcon className="size-3.5" /> Online
              </button>
            </div>
            {voiceError && <span className="ml-1 text-xs text-destructive">{voiceError}</span>}
          </div>

          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="flex size-9 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-80"
              aria-label="Stop answering"
              title="Stop"
            >
              <SquareIcon className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!text.trim()}
              className="flex size-9 items-center justify-center rounded-full bg-brand text-white transition-opacity hover:opacity-90 disabled:opacity-30"
              aria-label="Send"
              title="Send (Enter)"
            >
              <ArrowUpIcon className="size-[18px]" />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
