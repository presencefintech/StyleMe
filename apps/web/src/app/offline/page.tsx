import Link from "next/link";

export const metadata = { title: "Hors ligne · StyleMe" };

/** Page de secours affichée par le service worker quand le réseau est coupé. Volontairement sans appel API. */
export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center px-lg text-center">
      <div className="max-w-sm space-y-md">
        <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-signature text-h1 font-bold text-white shadow-glow">✦</span>
        <h1 className="font-display text-h1 font-semibold text-ink">Pas de connexion</h1>
        <p className="text-ink-muted">StyleMe a besoin d'Internet pour traiter vos photos. Vérifiez votre connexion puis réessayez.</p>
        <Link href="/enhance" className="inline-flex min-h-11 items-center rounded-pill bg-signature px-xl font-semibold text-white shadow-glow">Réessayer</Link>
      </div>
    </main>
  );
}
