import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// Icônes de l'app installable, générées à la demande puis mises en cache (pas de fichier binaire à maintenir).
// « maskable-512 » : fond plein et logo réduit, pour que le découpage rond/arrondi d'Android ne le rogne pas.
const VARIANTS = {
  "180": { px: 180, maskable: false },
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  "maskable-512": { px: 512, maskable: true },
} as const;

export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(VARIANTS).map((size) => ({ size }));
}


export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const v = VARIANTS[size as keyof typeof VARIANTS];
  if (!v) return new Response("Not found", { status: 404 });
  const glyph = Math.round(v.px * (v.maskable ? 0.62 : 0.78));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND.tile,
          borderRadius: 0,
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 100 100">
          <g fill="none" stroke={BRAND.paper} strokeWidth={BRAND.stroke} strokeLinecap="round" strokeLinejoin="round">
            <path d={BRAND.hook} />
            <path d={BRAND.hanger} />
          </g>
          <circle cx={BRAND.dot.cx} cy={BRAND.dot.cy} r={BRAND.dot.r} fill={BRAND.accent} />
        </svg>
      </div>
    ),
    { width: v.px, height: v.px, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
