"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { postUrl } from "@/components/share-post";
import { Card, cx } from "@/components/ui";
import { errorMessage, type PostView, type ReportReason } from "@/lib/api";
import { keys } from "@/features/queries";
import { useApi } from "@/lib/providers";

const REASONS: [ReportReason, string][] = [["inapproprie", "Contenu inapproprié"], ["usurpation", "Usurpation d'identité"], ["autre", "Autre"]];

/** « Essayer ce look » : ouvre l'étape suivante avec la tenue et la coiffure déjà choisies (jamais la photo de l'auteure). */
export function tryLookHref(look: PostView["look"]): string {
  const q = new URLSearchParams();
  if (look.garmentId) q.set("garment", look.garmentId);
  if (look.hairstyleId) q.set("hair", look.hairstyleId);
  if (look.makeupId) q.set("makeup", look.makeupId);
  if (look.accessoryIds.length > 0) q.set("acc", look.accessoryIds.join(","));
  if (look.occasionId) q.set("style", look.occasionId);
  return `/look?${q.toString()}`;
}

export function PostCard({ post, onChanged }: { post: PostView; onChanged?: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [liked, setLiked] = useState(post.likedByMe);
  const [count, setCount] = useState(post.likeCount);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const hasLook = Boolean(post.look.garmentId || post.look.hairstyleId || post.look.makeupId || post.look.accessoryIds.length > 0 || post.look.occasionId);

  async function toggleLike() {
    const next = !liked;
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1)); // optimiste
    try {
      await api.setLike(post.id, next);
    } catch (e) {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
      setNote(errorMessage(e));
    }
  }

  async function report(reason: ReportReason) {
    setReporting(false);
    try {
      await api.reportPost(post.id, reason);
      setNote("Merci, nous allons examiner ce look.");
    } catch (e) {
      setNote(errorMessage(e));
    }
  }

  async function remove() {
    if (!window.confirm("Retirer ce look du fil ? L'image publiée sera supprimée.")) return;
    try {
      await api.deletePost(post.id);
      void qc.invalidateQueries({ queryKey: keys.feed });
      void qc.invalidateQueries({ queryKey: keys.myPosts });
      onChanged?.();
    } catch (e) {
      setNote(errorMessage(e));
    }
  }

  return (
    <Card className="space-y-md overflow-hidden p-0 sm:p-0">
      <Link href={`/feed/${post.id}`} aria-label="Ouvrir ce look">
        <img src={post.imageUrl} alt={post.caption ?? "Look StyleMe"} loading="lazy" className="aspect-[3/4] w-full bg-bg-alt object-cover" />
      </Link>
      <div className="space-y-sm px-lg pb-lg">
        {post.caption && <p className="text-body">{post.caption}</p>}
        {(post.look.hairstyleName || post.look.makeupName) && (
          <p className="text-caption text-ink-muted">{[post.look.hairstyleName && `Coiffure : ${post.look.hairstyleName}`, post.look.makeupName && `Maquillage : ${post.look.makeupName}`].filter(Boolean).join(" · ")}</p>
        )}
        {(post.hidden || post.visibility === "UNLISTED") && (
          <p className="text-caption font-semibold text-accent-ink">
            {post.hidden ? "Masqué du fil suite à des signalements" : "Visible seulement avec le lien"}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-sm">
          <button
            type="button"
            onClick={toggleLike}
            aria-pressed={liked}
            className={cx("min-h-10 rounded-sm border px-md text-caption font-semibold transition", liked ? "border-primary bg-primary/10 text-ink" : "border-line text-ink-muted hover:text-ink")}
          >
            {liked ? "♥" : "♡"} {count}
          </button>
          {hasLook && (
            <Link href={tryLookHref(post.look)} className="inline-flex min-h-10 items-center rounded-sm bg-ink px-md text-caption font-semibold text-bg transition hover:bg-ink/85">
              Essayer ce look
            </Link>
          )}
          {post.mine ? (
            <button type="button" onClick={remove} className="min-h-10 px-sm text-caption text-danger underline">Retirer</button>
          ) : (
            <button type="button" onClick={() => setReporting((v) => !v)} className="min-h-10 px-sm text-caption text-ink-muted underline">Signaler</button>
          )}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(postUrl(post.id))}`}
            target="_blank"
            rel="noreferrer"
            className="min-h-10 px-sm py-2 text-caption text-ink-muted underline"
          >
            WhatsApp
          </a>
        </div>
        {reporting && (
          <div className="flex flex-wrap gap-sm" role="group" aria-label="Motif du signalement">
            {REASONS.map(([reason, label]) => (
              <button key={reason} type="button" onClick={() => report(reason)} className="rounded-sm border border-line px-md py-xs text-caption hover:border-primary/50">
                {label}
              </button>
            ))}
          </div>
        )}
        {note && <p role="status" className="text-caption text-ink-muted">{note}</p>}
      </div>
    </Card>
  );
}
