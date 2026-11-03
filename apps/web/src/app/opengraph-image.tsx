import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

// Aperçu du lien (messageries, réseaux) : le logo sur fond encre.
export const alt = "StyleMe";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 48, background: BRAND.tile }}>
        <svg width={280} height={280} viewBox="0 0 100 100">
          <g transform={BRAND.fit}>
            <g fill="none" stroke={BRAND.paper} strokeWidth={BRAND.stroke} strokeLinecap="round" strokeLinejoin="round">
              <path d={BRAND.hook} />
              <path d={BRAND.hanger} />
            </g>
            <circle cx={BRAND.dot.cx} cy={BRAND.dot.cy} r={BRAND.dot.r} fill={BRAND.accent} />
          </g>
        </svg>
        <div style={{ fontSize: 150, fontWeight: 800, color: BRAND.paper, textTransform: "uppercase", letterSpacing: -4 }}>StyleMe</div>
      </div>
    ),
    size,
  );
}
