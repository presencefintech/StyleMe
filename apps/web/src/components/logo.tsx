import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** Marque seule : carré noir, cintre clair, point citron. Dessin défini dans lib/brand.ts. */
export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className={className}>
      <rect width="100" height="100" className="fill-ink" />
      <g transform={BRAND.fit}>
        <g fill="none" strokeWidth={BRAND.stroke} strokeLinecap="round" strokeLinejoin="round" className="stroke-bg">
          <path d={BRAND.hook} />
          <path d={BRAND.hanger} />
        </g>
        <circle cx={BRAND.dot.cx} cy={BRAND.dot.cy} r={BRAND.dot.r} className="fill-accent" />
      </g>
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Link href="/enhance" className="flex items-center gap-sm text-ink" aria-label="StyleMe, accueil">
      <LogoMark size={size} className="shrink-0" />
      <span className="font-display text-[1.3rem] font-extrabold uppercase leading-none tracking-tight">StyleMe</span>
    </Link>
  );
}
