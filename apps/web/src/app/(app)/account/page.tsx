"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { RESULT_RETENTION_DAYS, SOURCE_RETENTION_DAYS } from "@styleme/shared";
import { Button, Card, ErrorNote, Field, Screen } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useApi, useAuth } from "@/lib/providers";

export default function AccountPage() {
  const api = useApi();
  const auth = useAuth();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      auth.signOut();
      router.replace("/login");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Screen eyebrow="Mon compte" title="Compte et confidentialité" subtitle={auth.session?.user.email}>
      <Card className="space-y-md">
        <h2 className="font-display text-h2 font-semibold">Vos photos</h2>
        <p className="text-ink-muted">
          Les photos que vous envoyez sont supprimées automatiquement après <strong className="text-ink">{SOURCE_RETENTION_DAYS} jours</strong>, les résultats et l'historique après{" "}
          <strong className="text-ink">{RESULT_RETENTION_DAYS} jours</strong>. Pensez à télécharger ce que vous voulez garder.
        </p>
        <p className="text-caption text-ink-muted">
          <Link href="/legal/privacy" className="font-semibold text-primary underline decoration-accent decoration-2 underline-offset-2 hover:bg-accent">Confidentialité</Link>
          {" · "}
          <Link href="/legal/terms" className="font-semibold text-primary underline decoration-accent decoration-2 underline-offset-2 hover:bg-accent">Conditions d'utilisation</Link>
        </p>
      </Card>

      <Card className="space-y-md border-danger/40">
        <h2 className="font-display text-h2 font-semibold text-danger">Supprimer mon compte</h2>
        <p className="text-ink-muted">
          Toutes vos photos, vos résultats et votre historique sont effacés immédiatement. Vos crédits restants sont perdus et il est impossible de revenir en arrière.
        </p>
        {!confirming ? (
          <Button variant="secondary" onClick={() => setConfirming(true)}>Supprimer mon compte</Button>
        ) : (
          <form onSubmit={remove} className="space-y-md">
            <Field
              label="Entrez votre mot de passe pour confirmer"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <ErrorNote message={error} />
            <div className="flex flex-wrap gap-sm">
              <Button type="submit" loading={busy} className="bg-danger bg-none text-white shadow-none hover:brightness-110">Supprimer définitivement</Button>
              <Button type="button" variant="ghost" onClick={() => { setConfirming(false); setPassword(""); setError(null); }}>Annuler</Button>
            </div>
          </form>
        )}
      </Card>
    </Screen>
  );
}
