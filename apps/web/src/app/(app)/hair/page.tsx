"use client";

import { useQueryClient } from "@tanstack/react-query";
import { HAIRSTYLES, JOB_BASE_COST, type Hairstyle } from "@styleme/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PhotoPicker } from "@/components/photo";
import { Button, Card, ErrorNote, Screen, cx } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { toDataUrl } from "@/lib/files";
import { keys, useBalance } from "@/features/queries";
import { useApi } from "@/lib/providers";

const COST = JOB_BASE_COST.HAIRSTYLE;
const CATEGORY_LABEL: Record<Hairstyle["category"], string> = { perruque: "Perruques lace frontal", tresses: "Tresses", naturel: "Naturel" };

function HairPage() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const balance = useBalance();
  /** Enchaînement : part du résultat d'un job précédent (ex. après un essayage de tenue). */
  const params = useSearchParams();
  const fromJob = params.get("job");
  const styleParam = params.get("style");
  const [hairstyleId, setHairstyleId] = useState<string | null>(HAIRSTYLES.some((x) => x.id === styleParam) ? styleParam : null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  async function start() {
    if (!hairstyleId || (!file && !fromJob)) return;
    setError(null);
    setNeedCredits(false);
    try {
      let input: { inputAssetIds: string[] } | { fromJobId: string };
      if (fromJob) input = { fromJobId: fromJob };
      else {
        setStep("uploading");
        const { assetId, uploadUrl } = await api.presign("SOURCE");
        await api.uploadToSignedUrl(uploadUrl, file!);
        input = { inputAssetIds: [assetId] };
      }
      setStep("creating");
      const { jobId } = await api.createJob({ type: "HAIRSTYLE", hairstyleId, ...input });
      void qc.invalidateQueries({ queryKey: keys.jobs });
      if (file) try { sessionStorage.setItem(`before:${jobId}`, await toDataUrl(file)); } catch { /* quota/privé */ }
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      setNeedCredits(e instanceof ApiError && e.status === 402);
      setError(errorMessage(e));
      setStep("idle");
    }
  }

  const busy = step !== "idle";
  const lacking = balance.data !== undefined && balance.data.balance < COST;
  const groups = (Object.keys(CATEGORY_LABEL) as Hairstyle["category"][])
    .map((category) => ({ category, items: HAIRSTYLES.filter((h) => h.category === category) }))
    .filter((g) => g.items.length > 0);

  return (
    <Screen eyebrow="Coiffure" title="Essayez une coiffure" subtitle="Choisissez une coiffure : seuls vos cheveux changent, votre visage reste strictement le vôtre.">
      {lacking && (
        <Card className="flex items-center justify-between gap-md border-accent/40">
          <span className="text-body">Il vous faut {COST} crédits pour une coiffure.</span>
          <Link href="/credits" className="font-semibold text-accent-ink underline">Recharger</Link>
        </Card>
      )}

      <div className="space-y-md">
        <h2 className="font-display text-h2 font-semibold">1. Choisissez la coiffure</h2>
        {groups.map((g) => (
          <div key={g.category} className="space-y-sm">
            <p className="text-caption font-semibold uppercase tracking-widest text-ink-muted">{CATEGORY_LABEL[g.category]}</p>
            <ul className="grid grid-cols-2 gap-md sm:grid-cols-3">
              {g.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={item.id === hairstyleId}
                    onClick={() => setHairstyleId(item.id)}
                    className={cx(
                      "block w-full rounded-md border bg-bg-surface px-md py-lg text-left text-body font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                      item.id === hairstyleId ? "border-primary ring-2 ring-primary" : "border-line hover:border-primary/50",
                    )}
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-md">
        <h2 className="font-display text-h2 font-semibold">2. Votre photo</h2>
        {fromJob ? (
          <Card><p className="text-body">La coiffure sera appliquée sur votre dernier résultat. <Link href="/hair" className="text-accent-ink underline">Utiliser une autre photo</Link></p></Card>
        ) : (
          <>
            <PhotoPicker file={file} onPick={setFile} disabled={busy} />
            <p className="text-tiny text-ink-muted">Pour un bon résultat : une photo de face, le visage bien visible, bien éclairée, cheveux non cachés.</p>
          </>
        )}
      </div>

      <ErrorNote message={error} />
      {needCredits && <Link href="/credits" className="text-accent-ink underline">Acheter des crédits</Link>}

      <Button onClick={start} disabled={!hairstyleId || (!file && !fromJob) || lacking} loading={busy} className="w-full">
        {step === "uploading" ? "Envoi de la photo…" : step === "creating" ? "Lancement…" : `Essayer cette coiffure · ${COST} crédits`}
      </Button>
      <p className="text-center text-tiny text-ink-muted">
        Le rendu est une simulation. Si aucun visage n'est détecté sur la photo, aucun crédit n'est débité.
      </p>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HairPage />
    </Suspense>
  );
}
