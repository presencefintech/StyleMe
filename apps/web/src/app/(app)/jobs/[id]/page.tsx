"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ResultViewer } from "@/components/photo";
import { Card, ErrorNote, JobStatusPill, Screen } from "@/components/ui";
import { REJECTION_MESSAGES, errorMessage } from "@/lib/api";
import { keys, useJob } from "@/features/queries";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useJob(id);
  const qc = useQueryClient();
  const [before, setBefore] = useState<string | null>(null);

  useEffect(() => {
    try { setBefore(sessionStorage.getItem(`before:${id}`)); } catch { /* indisponible */ }
  }, [id]);

  const status = job.data?.status;
  useEffect(() => {
    // Le débit a lieu à la livraison : on rafraîchit le solde et l'historique.
    if (status && status !== "PENDING" && status !== "PROCESSING") {
      void qc.invalidateQueries({ queryKey: keys.balance });
      void qc.invalidateQueries({ queryKey: keys.jobs });
    }
  }, [status, qc]);

  if (job.isError) return <Screen title="Résultat"><ErrorNote message={errorMessage(job.error)} /></Screen>;
  if (!job.data) return <Screen title="Résultat"><p className="text-ink-muted">Chargement…</p></Screen>;

  const j = job.data;
  const output = j.outputs?.[0]?.url;
  return (
    <Screen title="Votre photo">
      <div className="flex items-center gap-md">
        <JobStatusPill status={j.status} />
        {(j.status === "PENDING" || j.status === "PROCESSING") && (
          <span role="status" className="text-caption text-ink-muted">Traitement en cours, cela peut prendre quelques instants…</span>
        )}
      </div>

      {j.status === "DONE" && output && (
        <>
          <ResultViewer before={before} after={output} />
          <a href={output} download className="inline-block text-accent underline">Télécharger</a>
        </>
      )}

      {(j.status === "REJECTED" || j.status === "FAILED") && (
        <Card>
          <p>
            {(j.errorReason && REJECTION_MESSAGES[j.errorReason]) ??
              "Le traitement a échoué. Aucun crédit n'a été débité, vous pouvez réessayer."}
          </p>
        </Card>
      )}

      <Link href="/enhance" className="text-accent underline">Créer une autre photo</Link>
    </Screen>
  );
}
