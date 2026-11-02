"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhotoPicker } from "@/components/photo";
import { Button, ErrorNote, Screen, StyleCard } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { keys, useStyles } from "@/features/queries";
import { useApi } from "@/lib/providers";

export default function EnhancePage() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const styles = useStyles();
  const [file, setFile] = useState<File | null>(null);
  const [styleId, setStyleId] = useState<string | undefined>();
  const [step, setStep] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  async function start() {
    if (!file) return;
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
  return (
    <Screen title="Sublimez votre photo" subtitle="Choisissez une photo et une occasion, on s'occupe du reste.">
      <PhotoPicker file={file} onPick={setFile} disabled={busy} />

      {styles.data && styles.data.length > 0 && (
        <div>
          <h2 className="mb-md text-h2 font-semibold">Occasion</h2>
          <div className="grid grid-cols-2 gap-md sm:grid-cols-3">
            {styles.data.map((s) => (
              <StyleCard
                key={s.id}
                name={s.name}
                creditCost={s.creditCost}
                previewUrl={s.previewUrl}
                selected={styleId === s.id}
                onSelect={() => setStyleId(styleId === s.id ? undefined : s.id)}
              />
            ))}
          </div>
        </div>
      )}

      <ErrorNote message={error} />
      {needCredits && <Link href="/credits" className="text-accent underline">Acheter des crédits</Link>}

      <Button onClick={start} disabled={!file} loading={busy} className="w-full">
        {step === "uploading" ? "Envoi de la photo…" : step === "creating" ? "Création…" : "Sublimer ma photo"}
      </Button>
    </Screen>
  );
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
