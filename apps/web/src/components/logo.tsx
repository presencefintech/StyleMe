import Link from "next/link";
import { BRAND } from "@/lib/brand";

/** Marque seule : cintre à l'encre du thème, point terre cuite. Dessin défini dans lib/brand.ts. */
export function LogoMark({ size = 30, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={BRAND.stroke} strokeLinecap="round" strokeLinejoin="round">
        <path d={BRAND.hook} />
        <path d={BRAND.hanger} />
      </g>
      <circle cx={BRAND.dot.cx} cy={BRAND.dot.cy} r={BRAND.dot.r} className="fill-primary" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <Link href="/enhance" className="flex items-center gap-sm text-ink" aria-label="StyleMe, accueil">
      <LogoMark size={size} className="shrink-0" />
      <span className="font-display text-[1.5rem] font-semibold leading-none tracking-tight">StyleMe</span>
    </Link>
  );
}
