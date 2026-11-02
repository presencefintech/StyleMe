"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Card, CreditBadge, ErrorNote, Screen } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useBalance } from "@/features/queries";
import { useApi, useAuth } from "@/lib/providers";

const NAV = [
  { href: "/enhance", label: "Créer" },
  { href: "/history", label: "Historique" },
  { href: "/credits", label: "Crédits" },
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
    <Screen title="Avant de commencer" subtitle="StyleMe est réservé aux adultes.">
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
    <header className="border-b border-line bg-bg-surface">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-md px-lg py-md">
        <nav className="flex gap-md" aria-label="Navigation principale">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path.startsWith(n.href) ? "page" : undefined}
              className={path.startsWith(n.href) ? "font-semibold text-ink" : "text-ink-muted hover:text-ink"}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-md">
          <CreditBadge value={balance.data?.balance} />
          <Button variant="ghost" onClick={signOut} className="min-h-0 px-sm text-caption">Quitter</Button>
        </div>
      </div>
    </header>
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
      <main>{children}</main>
    </>
  );
}
