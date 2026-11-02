"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Button, Card, CreditBadge, ErrorNote, Screen, cx } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useBalance } from "@/features/queries";
import { useApi, useAuth } from "@/lib/providers";

const NAV = [
  { href: "/enhance", label: "Occasions", glyph: "✦" },
  { href: "/edit", label: "Retoucher", glyph: "✎" },
  { href: "/erase", label: "Gomme", glyph: "⌫" },
  { href: "/history", label: "Historique", glyph: "◷" },
  { href: "/credits", label: "Crédits", glyph: "◈" },
];

/** Age gate +18 : bloque l'accès tant que l'utilisateur n'a pas confirmé. */
function AgeGate() {
  const api = useApi();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await api.confirmAge();
      auth.markAgeConfirmed();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen eyebrow="Avant de commencer" title="StyleMe est réservé aux adultes" subtitle="Une confirmation rapide, une seule fois.">
      <Card className="space-y-lg">
        <p>Je confirme avoir 18 ans ou plus, et que je n'enverrai que des photos de moi ou de personnes adultes ayant donné leur accord.</p>
        <ErrorNote message={error} />
        <Button onClick={confirm} loading={busy} className="w-full">J'ai 18 ans ou plus</Button>
      </Card>
    </Screen>
  );
}

function Header() {
  const { signOut } = useAuth();
  const path = usePathname();
  const balance = useBalance();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-md px-lg py-md">
          <Logo />
          <nav className="hidden gap-xs md:flex" aria-label="Navigation principale">
            {NAV.map((n) => {
              const active = path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-pill px-lg py-sm text-body font-medium transition",
                    active ? "bg-primary/10 text-primary" : "text-ink-muted hover:bg-bg-alt hover:text-ink",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-sm">
            <Link href="/credits" aria-label="Mes crédits"><CreditBadge value={balance.data?.balance} /></Link>
            <Button variant="ghost" onClick={signOut} className="min-h-0 px-sm py-xs text-caption">Quitter</Button>
          </div>
        </div>
      </header>

      {/* Barre d'onglets mobile */}
      <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        {NAV.map((n) => {
          const active = path.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cx("flex flex-col items-center gap-0.5 py-sm text-tiny font-medium", active ? "text-primary" : "text-ink-muted")}
            >
              <span aria-hidden className="text-h2 leading-none">{n.glyph}</span>
              {n.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { ready, session } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  if (!ready || !session) return null;
  if (!session.user.ageConfirmed) return <AgeGate />;
  return (
    <>
      <Header />
      <main className="pb-24 md:pb-0">{children}</main>
    </>
  );
}
