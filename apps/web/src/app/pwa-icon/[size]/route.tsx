import { ImageResponse } from "next/og";

// Icônes de l'app installable, générées à la demande puis mises en cache (pas de fichier binaire à maintenir).
// « maskable-512 » : fond plein et étoile réduite, pour que le découpage rond/arrondi d'Android ne la rogne pas.
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

const STAR = "M50 6 C54 34 66 46 94 50 C66 54 54 66 50 94 C46 66 34 54 6 50 C34 46 46 34 50 6 Z";

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const v = VARIANTS[size as keyof typeof VARIANTS];
  if (!v) return new Response("Not found", { status: 404 });
  const glyph = Math.round(v.px * (v.maskable ? 0.52 : 0.62));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6C4CE0 0%, #FF6B6B 100%)",
          borderRadius: v.maskable ? 0 : Math.round(v.px * 0.22),
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 100 100">
          <path d={STAR} fill="#FFFFFF" />
        </svg>
      </div>
    ),
    { width: v.px, height: v.px, headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
  );
}
