"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Operator } from "@styleme/shared";
import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, CreditBadge, CreditPackCard, ErrorNote, Field, OperatorSelector, Screen } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { keys, useBalance, usePacks, usePayment, useReferral } from "@/features/queries";
import { useApi } from "@/lib/providers";

export default function CreditsPage() {
  const api = useApi();
  const qc = useQueryClient();
  const balance = useBalance();
  const packs = usePacks();
  const referral = useReferral();
  const [copied, setCopied] = useState(false);
  const [packId, setPackId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [operator, setOperator] = useState<Operator>("mpesa");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const payment = usePayment(paymentId);
  const status = payment.data?.status;

  useEffect(() => {
    if (status === "SUCCEEDED") void qc.invalidateQueries({ queryKey: keys.balance });
  }, [status, qc]);

  async function pay(e: FormEvent) {
    e.preventDefault();
    if (!packId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.initiatePayment({ packId, phone, operator });
      setPaymentId(r.paymentId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const shareLink = referral.data && typeof window !== "undefined" ? `${window.location.origin}/login?ref=${referral.data.code}` : "";
  const shareText = referral.data
    ? `Essaie StyleMe : tes photos dans le décor parfait. Avec mon code ${referral.data.code} tu reçois ${referral.data.signupBonus} crédits offerts ! ${shareLink}`
    : "";
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers indisponible : le lien reste affiché pour copie manuelle */
    }
  }

  const waiting = paymentId !== null && (status === undefined || status === "PENDING");
  return (
    <Screen title="Crédits" subtitle="Payez par Mobile Money, vos crédits sont ajoutés dès la confirmation.">
      <div className="flex items-center gap-md">
        <span className="text-body text-ink-muted">Solde actuel</span>
        <CreditBadge value={balance.data?.balance} />
      </div>

      <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
        {packs.data?.map((p, i) => (
          <CreditPackCard key={p.id} credits={p.credits} price={p.price} currency={p.currency} selected={packId === p.id} popular={i === 1} onSelect={() => setPackId(p.id)} />
        ))}
      </div>

      {referral.data && (
        <Card>
          <h2 className="font-display text-h2 font-semibold">Parrainez un ami</h2>
          <p className="mt-xs text-caption text-ink-muted">
            Votre ami reçoit {referral.data.signupBonus} crédits à l'inscription, et vous en gagnez {referral.data.referrerBonus} (jusqu'à {referral.data.maxRewardedReferrals} parrainages).
          </p>
          <p className="mt-md text-body">
            Votre code : <strong className="font-mono tracking-wider">{referral.data.code}</strong>
            <span className="ml-md text-caption text-ink-muted">{referral.data.referrals} ami(s) parrainé(s)</span>
          </p>
          <div className="mt-md flex flex-wrap gap-sm">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-primary px-lg py-sm font-semibold text-white"
            >
              Partager sur WhatsApp
            </a>
            <Button type="button" variant="secondary" onClick={copyLink}>{copied ? "Lien copié" : "Copier le lien"}</Button>
          </div>
        </Card>
      )}

      <Card>
        <form onSubmit={pay} className="space-y-lg">
          <OperatorSelector value={operator} onChange={setOperator} />
          <Field
            label="Numéro Mobile Money"
            type="tel"
            inputMode="tel"
            placeholder="+243 81 234 5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <ErrorNote message={error} />
          {waiting && <p role="status" className="text-caption text-warning">Validez le paiement sur votre téléphone…</p>}
          {status === "SUCCEEDED" && <p role="status" className="text-caption text-success">Paiement confirmé, crédits ajoutés.</p>}
          {status === "FAILED" && <ErrorNote message="Le paiement a échoué. Vous n'avez pas été débité." />}
          <Button type="submit" disabled={!packId || waiting} loading={busy} className="w-full">Payer</Button>
        </form>
      </Card>
    </Screen>
  );
}
