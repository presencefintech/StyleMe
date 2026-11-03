"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { InstallPrompt } from "@/components/pwa";
import { Button, Card, CreditBadge, ErrorNote, Screen, cx } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useBalance } from "@/features/queries";
import { useApi, useAuth } from "@/lib/providers";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/enhance", label: "Occasions", icon: "occasions" },
  { href: "/tryon", label: "Habillage", icon: "tryon" },
  { href: "/edit", label: "Retoucher", icon: "edit" },
  { href: "/erase", label: "Gomme", icon: "erase" },
  { href: "/history", label: "Historique", icon: "history" },
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

const SIDE_LINK = "flex items-center gap-md px-md py-sm text-body transition";
const ACTIVE_SIDE = "bg-bg font-semibold text-primary shadow-[inset_2px_0_0_rgb(var(--primary))]";
const IDLE_SIDE = "font-medium text-ink-muted hover:bg-bg hover:text-ink";

/** Navigation : barre latérale fixe sur ordinateur, en-tête compact + onglets en bas sur mobile. */
function Navigation() {
  const { signOut, session } = useAuth();
  const path = usePathname();
  const balance = useBalance();
  const isActive = (href: string) => path.startsWith(href);
  return (
    <>
      {/* Ordinateur : barre latérale */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-bg-alt px-lg py-xl md:flex">
        <Logo />

        <Link href="/credits" aria-label="Mes crédits" className="mt-xl block rounded-sm border border-line bg-bg px-md py-md transition hover:border-ink/40">
          <span className="block text-tiny font-semibold uppercase tracking-[0.12em] text-ink-muted">Solde</span>
          <span className="mt-0.5 flex items-baseline justify-between">
            <span className="font-display text-h1 font-semibold">{balance.data === undefined ? "…" : `${balance.data.balance} crédit${balance.data.balance > 1 ? "s" : ""}`}</span>
            <span className="text-caption font-semibold text-primary underline">Recharger</span>
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="mt-xl flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? "page" : undefined} className={cx(SIDE_LINK, isActive(n.href) ? ACTIVE_SIDE : IDLE_SIDE)}>
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="space-y-0.5 border-t border-line pt-md">
          <Link href="/account" aria-current={isActive("/account") ? "page" : undefined} className={cx(SIDE_LINK, "py-xs", isActive("/account") ? ACTIVE_SIDE : IDLE_SIDE)}>
            <Icon name="account" />
            <span className="min-w-0">
              <span className="block text-caption">Mon compte</span>
              {session?.user.email && <span className="block truncate text-tiny font-normal text-ink-muted">{session.user.email}</span>}
            </span>
          </Link>
          <button type="button" onClick={signOut} className={cx(SIDE_LINK, "w-full py-xs text-caption", IDLE_SIDE)}>
            <Icon name="logout" />
            Quitter
          </button>
          <p className="flex gap-md px-md pt-xs text-tiny text-ink-muted">
            <Link href="/legal/privacy" className="hover:text-ink">Confidentialité</Link>
            <Link href="/legal/terms" className="hover:text-ink">Conditions</Link>
          </p>
        </div>
      </aside>

      {/* Mobile : en-tête compact */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-sm md:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-md px-lg py-md">
          <Logo size={26} />
          <div className="flex items-center gap-sm">
            <Link href="/credits" aria-label="Mes crédits"><CreditBadge value={balance.data?.balance} /></Link>
            <Link href="/account" aria-label="Mon compte" aria-current={isActive("/account") ? "page" : undefined} className={cx("grid h-10 w-10 place-items-center", isActive("/account") ? "text-primary" : "text-ink-muted hover:text-ink")}>
              <Icon name="account" />
            </Link>
            <button type="button" onClick={signOut} aria-label="Quitter" className="grid h-10 w-10 place-items-center text-ink-muted hover:text-ink">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile : barre d'onglets */}
      <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg-alt pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={cx("flex flex-col items-center justify-center gap-1 py-sm text-tiny", active ? "font-semibold text-primary shadow-[inset_0_2px_0_rgb(var(--primary))]" : "font-medium text-ink-muted")}
            >
              <Icon name={n.icon} size={22} />
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
      <Navigation />
      <InstallPrompt />
      <main className="pb-24 md:pb-0 md:pl-64">{children}</main>
    </>
  );
}
