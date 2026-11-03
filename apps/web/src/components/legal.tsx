import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

/** Date de dernière mise à jour des textes légaux : à changer à chaque modification de fond. */
export const LEGAL_UPDATED = "3 novembre 2026";

/** Contact affiché dans les textes. Défini par NEXT_PUBLIC_CONTACT_EMAIL au déploiement ; absent = ligne de contact masquée. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || undefined;

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-lg pb-3xl pt-xl">
      <header className="flex items-center justify-between gap-md">
        <Logo />
        <Link href="/login" className="text-caption font-semibold text-primary underline decoration-accent decoration-2 underline-offset-2 hover:bg-accent">Retour à l'application</Link>
      </header>
      <h1 className="mt-2xl font-display text-display font-extrabold uppercase tracking-tight text-ink">{title}</h1>
      <p className="mt-sm text-caption text-ink-muted">Dernière mise à jour : {LEGAL_UPDATED}</p>
      <div className="mt-xl space-y-lg text-body text-ink">{children}</div>
      <footer className="mt-3xl flex flex-wrap gap-lg border-t border-line pt-lg text-caption text-ink-muted">
        <Link href="/legal/terms" className="hover:text-ink">Conditions d'utilisation</Link>
        <Link href="/legal/privacy" className="hover:text-ink">Confidentialité</Link>
      </footer>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-sm">
      <h2 className="font-display text-h2 font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-xs pl-xl text-ink-muted marker:text-primary">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
