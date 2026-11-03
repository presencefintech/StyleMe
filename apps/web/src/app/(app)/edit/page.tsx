"use client";

import { useQueryClient } from "@tanstack/react-query";
import { JOB_BASE_COST, MAX_PROMPT_LENGTH } from "@styleme/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhotoPicker } from "@/components/photo";
import { Button, Card, Chip, ErrorNote, INPUT_CLASS, Screen } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { toDataUrl } from "@/lib/files";
import { keys, useBalance } from "@/features/queries";
import { useApi } from "@/lib/providers";

const COST = JOB_BASE_COST.EDIT;
const EXAMPLES = [
  "Enlève l'objet au fond de l'image",
  "Supprime la personne à l'arrière-plan",
  "Enlève les câbles et les panneaux derrière moi",
  "Remplace le fond par une plage au coucher du soleil",
];

export default function EditPage() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const balance = useBalance();
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [step, setStep] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);

  async function start() {
    if (!file || !prompt.trim()) return;
    setError(null);
    setNeedCredits(false);
    try {
      setStep("uploading");
      const { assetId, uploadUrl } = await api.presign("SOURCE");
      await api.uploadToSignedUrl(uploadUrl, file);
      setStep("creating");
      const { jobId } = await api.createJob({ type: "EDIT", prompt: prompt.trim(), inputAssetIds: [assetId] });
      void qc.invalidateQueries({ queryKey: keys.jobs });
      try { sessionStorage.setItem(`before:${jobId}`, await toDataUrl(file)); } catch { /* quota/privé */ }
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      setNeedCredits(e instanceof ApiError && e.status === 402);
      setError(errorMessage(e));
      setStep("idle");
    }
  }

  const busy = step !== "idle";
  const lacking = balance.data !== undefined && balance.data.balance < COST;
  return (
    <Screen title="Retoucher avec une instruction" subtitle="Décrivez ce que vous voulez changer. Le reste de la photo, texte compris, reste tel quel.">
      {lacking && (
        <Card className="flex items-center justify-between gap-md border-accent/40">
          <span className="text-body">Il vous faut {COST} crédits pour une retouche.</span>
          <Link href="/credits" className="font-semibold text-accent-ink underline">Recharger</Link>
        </Card>
      )}

      <PhotoPicker file={file} onPick={setFile} disabled={busy} />

      <div>
        <label htmlFor="prompt" className="mb-xs block text-caption font-medium text-ink-muted">Votre instruction</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={MAX_PROMPT_LENGTH}
          rows={3}
          disabled={busy}
          placeholder="Ex. : enlève l'objet au fond de l'image"
          className={INPUT_CLASS + " p-md"}
        />
        <div className="mt-xs flex justify-between text-tiny text-ink-muted">
          <span>Soyez précis : que retirer, ou que changer.</span>
          <span>{prompt.length}/{MAX_PROMPT_LENGTH}</span>
        </div>
        <div className="mt-md flex flex-wrap gap-sm">
          {EXAMPLES.map((ex) => (
            <Chip key={ex} disabled={busy} onClick={() => setPrompt(ex)}>
              {ex}
            </Chip>
          ))}
        </div>
      </div>

      <ErrorNote message={error} />
      {needCredits && <Link href="/credits" className="text-accent-ink underline">Acheter des crédits</Link>}

      <Button onClick={start} disabled={!file || !prompt.trim() || lacking} loading={busy} className="w-full">
        {step === "uploading" ? "Envoi de la photo…" : step === "creating" ? "Lancement…" : `Retoucher ma photo · ${COST} crédits`}
      </Button>
      <p className="text-center text-tiny text-ink-muted">
        Vos photos restent privées. Les crédits ne sont débités que si le résultat vous est livré.
      </p>
    </Screen>
  );
}
