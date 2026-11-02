"use client";

import Link from "next/link";
import { Button, Card, ErrorNote, JobStatusPill, Screen } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useJobHistory } from "@/features/queries";

export default function HistoryPage() {
  const q = useJobHistory();
  const jobs = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen title="Historique">
      {q.isError && <ErrorNote message={errorMessage(q.error)} />}
      {q.isLoading && <p className="text-ink-muted">Chargement…</p>}
      {q.isSuccess && jobs.length === 0 && <p className="text-ink-muted">Aucun rendu pour l'instant.</p>}

      <ul className="space-y-md">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/jobs/${j.id}`} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <Card className="flex items-center justify-between">
                <span className="text-caption text-ink-muted">
                  {j.createdAt ? new Date(j.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : j.id}
                </span>
                <JobStatusPill status={j.status} />
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {q.hasNextPage && (
        <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} className="w-full">
          Voir plus
        </Button>
      )}
    </Screen>
  );
}
