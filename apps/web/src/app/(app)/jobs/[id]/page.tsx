"use client";

import { useQueryClient } from "@tanstack/react-query";
import { JOB_BASE_COST, MAX_PROMPT_LENGTH, type JobStatus } from "@styleme/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ResultActions, ResultViewer } from "@/components/photo";
import { Button, Card, Chip, ErrorNote, INPUT_CLASS, JobStatusPill, Screen } from "@/components/ui";
import { ApiError, REJECTION_MESSAGES, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/providers";
import { keys, useJob } from "@/features/queries";

const STEPS: { label: string; reached: (s: JobStatus) => boolean }[] = [
  { label: "Photo reçue", reached: () => true },
  { label: "Vérification et traitement", reached: (s) => s !== "PENDING" },
  { label: "Photo prête", reached: (s) => s === "DONE" },
];

function Progress({ status }: { status: JobStatus }) {
  const failed = status === "REJECTED" || status === "FAILED";
  return (
    <ol className="space-y-sm" aria-label="Progression">
      {STEPS.map((s, i) => {
        const done = s.reached(status) && !(failed && i > 0);
        const active = !done && !failed && i > 0 && STEPS[i - 1]!.reached(status);
        return (
          <li key={s.label} className="flex items-center gap-md">
            <span
              aria-hidden
              className={[
                "grid h-6 w-6 place-items-center rounded-pill text-tiny font-bold",
                done ? "bg-success text-bg" : active ? "animate-pulse bg-primary text-white" : "bg-bg-alt text-ink-muted",
              ].join(" ")}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={done || active ? "text-ink" : "text-ink-muted"}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const FOLLOW_UPS = ["Enlève un autre objet", "Rends la lumière plus chaude", "Remplace le fond par un décor de plage", "Retouche les petits défauts"];

/** Continue la conversation : une nouvelle instruction appliquée au RÉSULTAT affiché (retouche enchaînée). */
function ContinueEdit({ jobId, resultUrl }: { jobId: string; resultUrl: string }) {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);
  const cost = JOB_BASE_COST.EDIT;

  async function submit() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setNeedCredits(false);
    try {
      const { jobId: next } = await api.createJob({ type: "EDIT", prompt: prompt.trim(), fromJobId: jobId });
      void qc.invalidateQueries({ queryKey: keys.jobs });
      try {
        sessionStorage.setItem(`before:${next}`, resultUrl); // comparaison avec la version actuelle
        sessionStorage.setItem(`parent:${next}`, jobId);
      } catch { /* stockage indisponible */ }
      router.push(`/jobs/${next}`);
    } catch (e) {
      setNeedCredits(e instanceof ApiError && e.status === 402);
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-md">
      <h2 className="text-h2 font-semibold">Continuer la retouche</h2>
      <p className="text-caption text-ink-muted">Une nouvelle instruction s'applique à cette version de la photo.</p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        maxLength={MAX_PROMPT_LENGTH}
        rows={2}
        disabled={busy}
        aria-label="Nouvelle instruction"
        placeholder="Ex. : maintenant, enlève aussi le panneau à gauche"
        className={INPUT_CLASS + " p-md"}
      />
      <div className="flex flex-wrap gap-sm">
        {FOLLOW_UPS.map((f) => (
          <Chip key={f} disabled={busy} onClick={() => setPrompt(f)}>
            {f}
          </Chip>
        ))}
      </div>
      <ErrorNote message={error} />
      {needCredits && <Link href="/credits" className="text-accent-ink underline">Acheter des crédits</Link>}
      <Button onClick={submit} loading={busy} disabled={!prompt.trim()} className="w-full">Appliquer · {cost} crédits</Button>
    </Card>
  );
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useJob(id);
  const qc = useQueryClient();
  const [before, setBefore] = useState<string | null>(null);
  const [parent, setParent] = useState<string | null>(null);

  useEffect(() => {
    try {
      setBefore(sessionStorage.getItem(`before:${id}`));
      setParent(sessionStorage.getItem(`parent:${id}`));
    } catch { /* indisponible */ }
  }, [id]);

  const status = job.data?.status;
  useEffect(() => {
    // Le débit a lieu à la livraison : on rafraîchit le solde et l'historique.
    if (status && status !== "PENDING" && status !== "PROCESSING") {
      void qc.invalidateQueries({ queryKey: keys.balance });
      void qc.invalidateQueries({ queryKey: keys.jobs });
    }
  }, [status, qc]);

  if (job.isError) return <Screen title="Votre photo"><ErrorNote message={errorMessage(job.error)} /></Screen>;
  if (!job.data) return <Screen title="Votre photo"><p className="text-ink-muted">Chargement…</p></Screen>;

  const j = job.data;
  const output = j.outputs?.[0]?.url;
  const working = j.status === "PENDING" || j.status === "PROCESSING";
  return (
    <Screen title={j.status === "DONE" ? "Votre photo est prête" : "Votre photo"}>
      {parent && <Link href={`/jobs/${parent}`} className="text-caption text-ink-muted hover:text-ink">← Version précédente</Link>}
      <div className="flex items-center gap-md">
        <JobStatusPill status={j.status} />
        {working && <span role="status" className="text-caption text-ink-muted">Cela prend généralement moins d'une minute.</span>}
      </div>

      <Card><Progress status={j.status} /></Card>

      {j.status === "DONE" && output && (
        <>
          <ResultViewer before={before ?? j.sourceUrl ?? null} after={output} />
          <ResultActions url={output} />
          {j.type === "EDIT" && <ContinueEdit jobId={id} resultUrl={output} />}
          {j.type === "ERASE" && (
            <Card className="flex flex-wrap items-center justify-between gap-md">
              <div>
                <p className="font-semibold">Un autre objet à enlever ?</p>
                <p className="text-caption text-ink-muted">Continuez sur cette version de la photo.</p>
              </div>
              <Link href={`/erase?job=${id}`} className="inline-flex min-h-12 items-center justify-center rounded-sm bg-ink px-xl font-semibold text-bg transition hover:bg-ink/85">Gommer un autre objet</Link>
            </Card>
          )}
        </>
      )}

      {(j.status === "REJECTED" || j.status === "FAILED") && (
        <Card className="border-danger/40">
          <p>
            {(j.errorReason && REJECTION_MESSAGES[j.errorReason]) ??
              "Le traitement a échoué. Aucun crédit n'a été débité, vous pouvez réessayer."}
          </p>
        </Card>
      )}

      <Link href="/enhance" className="text-accent-ink underline">Créer une autre photo</Link>
    </Screen>
  );
}
