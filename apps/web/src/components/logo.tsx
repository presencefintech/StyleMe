import Link from "next/link";

export function Logo() {
  return (
    <Link href="/enhance" className="flex items-center gap-sm" aria-label="StyleMe, accueil">
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-md bg-signature text-body font-bold text-white shadow-glow">✦</span>
      <span className="font-display text-h1 font-semibold tracking-tight text-ink">StyleMe</span>
    </Link>
  );
}
