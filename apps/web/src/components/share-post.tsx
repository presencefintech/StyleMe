"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MAX_CAPTION_LENGTH, type PostVisibility } from "@styleme/shared";
import Link from "next/link";
import { useState } from "react";
import { Button, Card, ErrorNote, INPUT_CLASS } from "@/components/ui";
import { errorMessage, type PostView } from "@/lib/api";
import { keys } from "@/features/queries";
import { useApi } from "@/lib/providers";

/** Adresse partageable d'un look (WhatsApp, etc.). */
export const postUrl = (id: string) => `${window.location.origin}/feed/${encodeURIComponent(id)}`;

/** Publier le résultat dans le fil : consentement explicite, public ou par lien seulement. */
export function SharePost({ jobId }: { jobId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<PostVisibility>("PUBLIC");
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<PostView | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      setPost(await api.publishPost({ jobId, visibility, caption: caption.trim() || undefined }));
      void qc.invalidateQueries({ queryKey: keys.feed });
      void qc.invalidateQueries({ queryKey: keys.myPosts });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (post) {
    const link = postUrl(post.id);
    return (
      <Card className="space-y-md">
        <p className="font-semibold">{post.visibility === "PUBLIC" ? "Votre look est dans le fil." : "Votre look est partageable par lien."}</p>
        <div className="flex flex-wrap gap-sm">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Mon look StyleMe : ${link}`)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center justify-center rounded-sm bg-ink px-xl font-semibold text-bg transition hover:bg-ink/85"
          >
            Partager sur WhatsApp
          </a>
          <Link href="/feed" className="inline-flex min-h-12 items-center justify-center rounded-sm border border-ink/70 px-xl font-semibold text-ink">Voir le fil</Link>
        </div>
      </Card>
    );
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <p className="font-semibold">Montrer ce look ?</p>
          <p className="text-caption text-ink-muted">Publiez-le dans le fil pour que d'autres puissent l'aimer et l'essayer.</p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>Publier</Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-md">
      <p className="font-semibold">Publier ce look</p>
      <fieldset className="space-y-sm">
        <legend className="sr-only">Qui peut le voir</legend>
        {([["PUBLIC", "Dans le fil, visible de tous les membres"], ["UNLISTED", "Seulement avec le lien (hors du fil)"]] as const).map(([value, label]) => (
          <label key={value} className="flex items-center gap-sm text-body">
            <input type="radio" name="visibility" checked={visibility === value} onChange={() => setVisibility(value)} />
            {label}
          </label>
        ))}
      </fieldset>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION_LENGTH))}
        rows={2}
        aria-label="Légende (facultatif)"
        placeholder="Légende (facultatif) : mariage de ma cousine…"
        className={INPUT_CLASS + " p-md"}
      />
      <label className="flex items-start gap-sm text-caption text-ink-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>Je comprends que cette photo, avec mon visage, sera visible d'autres personnes. Je peux la retirer à tout moment depuis « Mes looks ». Elle est publiée sans mon nom.</span>
      </label>
      <ErrorNote message={error} />
      <div className="flex gap-sm">
        <Button onClick={publish} loading={busy} disabled={!consent} className="flex-1">Publier</Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Annuler</Button>
      </div>
    </Card>
  );
}
