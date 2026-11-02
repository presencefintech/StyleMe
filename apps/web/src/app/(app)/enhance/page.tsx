"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PhotoPicker } from "@/components/photo";
import { Button, Card, ErrorNote, Screen, StyleCard, cx } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { toDataUrl } from "@/lib/files";
import { gradientCss } from "@/lib/style-palettes";
import { keys, useBalance, useStyles } from "@/features/queries";
import { useApi } from "@/lib/providers";

type Mode = "cleanup" | "occasion";

const CLEANUP_POINTS = [
  "Flou et bruit corrigés, image nette",
  "Fond encombré remplacé par un fond de studio propre",
  "Visage et vêtements strictement inchangés",
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-md flex items-center gap-sm text-h2 font-semibold">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-pill bg-signature text-caption font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const tabs: { id: Mode; label: string; hint: string }[] = [
    { id: "cleanup", label: "Nettoyage & Studio", hint: "Photo de profil" },
    { id: "occasion", label: "Occasions", hint: "Décor d'événement" },
  ];
  return (
    <div role="tablist" aria-label="Type de transformation" className="grid grid-cols-2 gap-xs rounded-lg bg-bg-alt p-xs">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={mode === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "rounded-md px-md py-sm text-left transition",
            mode === t.id ? "bg-bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink",
          )}
        >
          <span className="block text-body font-semibold">{t.label}</span>
          <span className="block text-tiny">{t.hint}</span>
        </button>
      ))}
    </div>
  );
}

export default function EnhancePage() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const styles = useStyles();
  const balance = useBalance();
  const [mode, setMode] = useState<Mode>("cleanup");
  const [file, setFile] = useState<File | null>(null);
  const [occasionId, setOccasionId] = useState<string | undefined>();
  const [cleanupId, setCleanupId] = useState<string | undefined>();
  const [step, setStep] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  const occasions = styles.data?.filter((s) => s.kind !== "CLEANUP") ?? [];
  const backdrops = styles.data?.filter((s) => s.kind === "CLEANUP") ?? [];

  // Un choix est présélectionné dans chaque mode : sans style, le résultat serait un détourage sur fond transparent.
  useEffect(() => {
    if (!occasionId && occasions[0]) setOccasionId(occasions[0].id);
    if (!cleanupId && backdrops[0]) setCleanupId(backdrops[0].id);
  }, [occasions, backdrops, occasionId, cleanupId]);

  const styleId = mode === "cleanup" ? cleanupId : occasionId;

  async function start() {
    if (!file || !styleId) return;
    setError(null);
    setNeedCredits(false);
    try {
      setStep("uploading");
      const { assetId, uploadUrl } = await api.presign("SOURCE");
      await api.uploadToSignedUrl(uploadUrl, file);
      setStep("creating");
      const { jobId } = await api.createJob({ type: "ENHANCE", styleId, inputAssetIds: [assetId] });
      void qc.invalidateQueries({ queryKey: keys.jobs });
      // L'aperçu "avant" est gardé côté navigateur uniquement (jamais ré-téléchargé).
      try { sessionStorage.setItem(`before:${jobId}`, await toDataUrl(file)); } catch { /* quota/privé : on affichera le résultat seul */ }
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      setNeedCredits(e instanceof ApiError && e.status === 402);
      setError(errorMessage(e));
      setStep("idle");
    }
  }

  const busy = step !== "idle";
  const empty = balance.data?.balance === 0;
  const isCleanup = mode === "cleanup";

  return (
    <Screen
      title={isCleanup ? "Votre photo de profil, nette et propre" : "Une belle photo pour chaque occasion"}
      subtitle={
        isCleanup
          ? "Nettoyez votre photo en un clic : on corrige le flou et on remplace le fond. Vous restez exactement comme vous êtes."
          : "Envoyez un portrait, choisissez l'occasion : on place votre photo dans le bon décor."
      }
    >
      <ModeSwitch mode={mode} onChange={setMode} />

      {empty && (
        <Card className="flex items-center justify-between gap-md border-accent/40">
          <span className="text-body">Vous n'avez plus de crédits.</span>
          <Link href="/credits" className="font-semibold text-accent-ink underline">Recharger</Link>
        </Card>
      )}

      <Step n={1} title="Votre photo">
        <PhotoPicker file={file} onPick={setFile} disabled={busy} />
      </Step>

      {isCleanup ? (
        <Step n={2} title="Le fond">
          <ul className="mb-lg space-y-xs">
            {CLEANUP_POINTS.map((p) => (
              <li key={p} className="flex items-center gap-sm text-caption text-ink-muted">
                <span aria-hidden className="grid h-5 w-5 place-items-center rounded-pill bg-success/15 text-tiny font-bold text-success">✓</span>
                {p}
              </li>
            ))}
          </ul>
          {styles.isLoading && <p className="text-caption text-ink-muted">Chargement…</p>}
          {styles.isError && <ErrorNote message={errorMessage(styles.error)} />}
          <div role="radiogroup" aria-label="Couleur du fond" className="grid grid-cols-2 gap-md sm:grid-cols-4">
            {backdrops.map((s) => {
              const on = cleanupId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCleanupId(s.id)}
                  className={cx(
                    "rounded-lg border-2 bg-bg-surface p-sm text-center shadow-card transition",
                    on ? "border-primary ring-4 ring-primary/20" : "border-line hover:border-primary/40",
                  )}
                >
                  <span aria-hidden className="block h-16 rounded-md border border-line" style={{ backgroundImage: gradientCss(s.id) }} />
                  <span className="mt-sm block text-caption font-semibold text-ink">{s.name}</span>
                </button>
              );
            })}
          </div>
        </Step>
      ) : (
        <Step n={2} title="L'occasion">
          {styles.isLoading && <p className="text-caption text-ink-muted">Chargement des occasions…</p>}
          {styles.isError && <ErrorNote message={errorMessage(styles.error)} />}
          <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {occasions.map((s) => (
              <StyleCard
                key={s.id}
                id={s.id}
                name={s.name}
                creditCost={s.creditCost}
                previewUrl={s.previewUrl}
                selected={occasionId === s.id}
                onSelect={() => setOccasionId(s.id)}
              />
            ))}
          </div>
        </Step>
      )}

      <ErrorNote message={error} />
      {needCredits && <Link href="/credits" className="text-accent-ink underline">Acheter des crédits</Link>}

      <Button onClick={start} disabled={!file || !styleId || empty} loading={busy} className="w-full">
        {step === "uploading" ? "Envoi de la photo…" : step === "creating" ? "Lancement…" : isCleanup ? "Nettoyer ma photo (1 ✦)" : "Sublimer ma photo (1 ✦)"}
      </Button>
      <p className="text-center text-tiny text-ink-muted">
        Vos photos restent privées. Un crédit n'est débité que si le résultat vous est livré.
      </p>
    </Screen>
  );
}
