import type { ReactNode } from "react";

/** Jeu d'icônes unique : traits de 1,6 px, extrémités arrondies, pensé pour 20-24 px. Jamais de symbole unicode comme icône. */
const PATHS = {
  occasions: (<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>),
  tryon: (<><path d="M12 8V6.5a2 2 0 1 1 2 2" /><path d="M12 8 3.5 14.5a1 1 0 0 0 .6 1.8h15.8a1 1 0 0 0 .6-1.8L12 8Z" /></>),
  edit: (<path d="M4 20h4L19 9l-4-4L4 16v4Z" />),
  erase: (<path d="M9 20h10M5.5 15 14 6.5l4.5 4.5-6 6H8.5l-3-2.5Z" />),
  history: (<><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>),
  credits: (<><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" /><path d="M4 7l11-3.5V7M16 13.5h4" /></>),
  account: (<><circle cx="12" cy="9" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>),
  logout: (<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" />),
  check: (<path d="m5 12 5 5 9-10" />),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {PATHS[name]}
    </svg>
  );
}
