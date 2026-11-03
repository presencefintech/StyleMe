"use client";

import { useQueryClient } from "@tanstack/react-query";
import { JOB_BASE_COST, type GarmentCategory } from "@styleme/shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PhotoPicker } from "@/components/photo";
import { Button, Card, ErrorNote, Screen, cx } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { toDataUrl } from "@/lib/files";
import { keys, useBalance, useGarments } from "@/features/queries";
import { useApi } from "@/lib/providers";

const COST = JOB_BASE_COST.TRYON;
const CATEGORY_LABEL: Record<GarmentCategory, string> = { DRESSES: "Robes", UPPER_BODY: "Hauts", LOWER_BODY: "Bas" };

function TryOnPage() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const balance = useBalance();
  const garments = useGarments();
  /** « Essayer ce look » : tenue (et coiffure à enchaîner ensuite) venues d'un look du fil. */
  const params = useSearchParams();
  const nextHair = params.get("hair");
  const [garmentId, setGarmentId] = useState<string | null>(params.get("garment"));
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  async function start() {
    if (!file || !garmentId) return;
    setError(null);
    setNeedCredits(false);
    try {
      setStep("uploading");
      const { assetId, uploadUrl } = await api.presign("SOURCE");
      await api.uploadToSignedUrl(uploadUrl, file);
      setStep("creating");
      const { jobId } = await api.createJob({ type: "TRYON", garmentId, inputAssetIds: [assetId] });
      void qc.invalidateQueries({ queryKey: keys.jobs });
      try { sessionStorage.setItem(`before:${jobId}`, await toDataUrl(file)); } catch { /* quota/privé */ }
      try { if (nextHair) sessionStorage.setItem(`nextHair:${jobId}`, nextHair); } catch { /* privé */ }
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      setNeedCredits(e instanceof ApiError && e.status === 402);
      setError(errorMessage(e));
      setStep("idle");
    }
  }

  const busy = step !== "idle";
  const lacking = balance.data !== undefined && balance.data.balance < COST;
  const list = garments.data ?? [];
  // Une tenue retirée du catalogue depuis la publication du look ne peut plus être essayée.
  const chosen = garmentId !== null && list.some((g) => g.id === garmentId);
  const groups = (Object.keys(CATEGORY_LABEL) as GarmentCategory[])
    .map((category) => ({ category, items: list.filter((g) => g.category === category) }))
    .filter((g) => g.items.length > 0);

  return (
    <Screen eyebrow="Habillage virtuel" title="Essayez une tenue" subtitle="Choisissez une tenue, envoyez une photo de vous : votre visage, votre pose et votre décor restent les mêmes.">
      {lacking && (
        <Card className="flex items-center justify-between gap-md border-accent/40">
          <span className="text-body">Il vous faut {COST} crédits pour un essayage.</span>
          <Link href="/credits" className="font-semibold text-accent-ink underline">Recharger</Link>
        </Card>
      )}

      <div className="space-y-md">
        <h2 className="font-display text-h2 font-semibold">1. Choisissez la tenue</h2>
        {garments.isLoading && <p className="text-ink-muted">Chargement du catalogue…</p>}
        {garments.isError && <ErrorNote message="Le catalogue n'a pas pu être chargé. Réessayez dans un instant." />}
        {garments.isSuccess && list.length === 0 && (
          <Card><p className="text-ink-muted">Le catalogue de tenues arrive bientôt. Revenez vite !</p></Card>
        )}
        {groups.map((g) => (
          <div key={g.category} className="space-y-sm">
            <p className="text-caption font-semibold uppercase tracking-widest text-ink-muted">{CATEGORY_LABEL[g.category]}</p>
            <ul className="grid grid-cols-2 gap-md sm:grid-cols-3">
              {g.items.map((item) => {
                const selected = item.id === garmentId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={selected}
                      onClick={() => setGarmentId(item.id)}
                      className={cx(
                        "block w-full overflow-hidden rounded-md border bg-bg-surface text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                        selected ? "border-primary ring-2 ring-primary" : "border-line hover:border-primary/50",
                      )}
                    >
                      <img src={item.previewUrl} alt={item.name} loading="lazy" className="aspect-[3/4] w-full bg-bg-alt object-contain" />
                      <span className="block px-sm py-xs text-caption font-medium text-ink">{item.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-md">
        <h2 className="font-display text-h2 font-semibold">2. Votre photo</h2>
        <PhotoPicker file={file} onPick={setFile} disabled={busy} />
        <p className="text-tiny text-ink-muted">
          Pour un bon résultat : une photo de face, debout, avec le corps visible en entier, bien éclairée, sans objet qui cache la silhouette.
        </p>
      </div>

      <ErrorNote message={error} />
      {needCredits && <Link href="/credits" className="text-accent-ink underline">Acheter des crédits</Link>}

      <Button onClick={start} disabled={!file || !chosen || lacking} loading={busy} className="w-full">
        {step === "uploading" ? "Envoi de la photo…" : step === "creating" ? "Lancement…" : `Essayer cette tenue · ${COST} crédits`}
      </Button>
      <p className="text-center text-tiny text-ink-muted">
        Le rendu est une simulation : les motifs très détaillés peuvent être simplifiés. Les crédits ne sont débités que si le résultat vous est livré.
      </p>
    </Screen>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TryOnPage />
    </Suspense>
  );
}
