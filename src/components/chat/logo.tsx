import Link from "next/link";
import { cn } from "@/lib/utils";

/** AskICT mark: a speech bubble carrying a graduation cap. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8 shrink-0", className)} aria-hidden="true">
      <rect width="40" height="40" rx="11" className="fill-brand" />
      <path
        d="M10.5 13.5a4.5 4.5 0 0 1 4.5-4.5h10a4.5 4.5 0 0 1 4.5 4.5v7.5a4.5 4.5 0 0 1-4.5 4.5h-5.6l-5.4 4.3v-4.5a4.5 4.5 0 0 1-3.5-4.3z"
        fill="#fff"
      />
      <path d="M20 12.2l6.3 2.8-6.3 2.8-6.3-2.8z" className="fill-gold" />
      <path d="M16.3 16.5v2.6c0 1.1 1.7 2 3.7 2s3.7-.9 3.7-2v-2.6L20 18.1z" className="fill-gold" />
      <path d="M25.6 15.3v3.4" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" className="text-gold" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="AskICT home">
      <LogoMark />
      <span className="text-[17px] font-extrabold tracking-tight text-ink">
        Ask<span className="text-brand">ICT</span>
      </span>
    </Link>
  );
}

/** Soft glowing orb for the welcome screen (green + gold). */
export function Orb() {
  return (
    <div className="orb relative mx-auto size-28" aria-hidden="true">
      <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(29,91,63,0.22),transparent_65%)] blur-2xl" />
      <div className="orb-ring absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#1d5b3f,#c99a2e,#7fb59a,#1d5b3f)] opacity-80 blur-md" />
      <div className="absolute inset-2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#eaf3ee_45%,#cfe3d7)] shadow-inner" />
      <div className="absolute inset-0 flex items-center justify-center">
        <LogoMark className="size-11 drop-shadow-md" />
      </div>
    </div>
  );
}
