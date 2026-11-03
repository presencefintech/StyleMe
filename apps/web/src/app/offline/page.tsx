import Link from "next/link";
import { LogoMark } from "@/components/logo";

export const metadata = { title: "Hors ligne · StyleMe" };

/** Page de secours affichée par le service worker quand le réseau est coupé. Volontairement sans appel API. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center px-lg text-center">
      <div className="max-w-sm space-y-md">
        <LogoMark size={44} className="mx-auto text-ink" />
        <h1 className="font-display text-h1 font-semibold text-ink">Pas de connexion</h1>
        <p className="text-ink-muted">StyleMe a besoin d'Internet pour traiter vos photos. Vérifiez votre connexion puis réessayez.</p>
        <Link href="/enhance" className="inline-flex min-h-11 items-center justify-center rounded-sm bg-ink px-xl font-semibold text-bg transition hover:bg-ink/85">Réessayer</Link>
      </div>
    </main>
  );
}
