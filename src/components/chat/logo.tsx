import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="AskICT home">
      <span className="flex size-8 items-center justify-center rounded-xl bg-brand text-sm font-black text-white">
        A
      </span>
      <span className="text-lg font-bold tracking-tight text-navy dark:text-foreground">
        Ask<span className="text-brand">ICT</span>
      </span>
    </Link>
  );
}
