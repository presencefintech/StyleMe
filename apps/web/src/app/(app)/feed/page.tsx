"use client";

import { useState } from "react";
import { PostCard } from "@/components/post-card";
import { Button, Card, ErrorNote, Screen, cx } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { useFeed, useMyPosts } from "@/features/queries";

type Tab = "feed" | "mine";

export default function FeedPage() {
  const [tab, setTab] = useState<Tab>("feed");
  const feed = useFeed();
  const mine = useMyPosts();
  const q = tab === "feed" ? feed : mine;
  const posts = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Screen eyebrow="Communauté" title="Le fil" subtitle="Découvrez les looks des membres, aimez-les, et essayez-les en un clic sur votre propre photo.">
      <div role="tablist" aria-label="Fil" className="flex gap-sm">
        {([["feed", "Le fil"], ["mine", "Mes looks"]] as const).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cx("min-h-10 rounded-sm border px-lg text-body font-semibold transition", tab === value ? "border-ink bg-ink text-bg" : "border-line text-ink-muted hover:text-ink")}
          >
            {label}
          </button>
        ))}
      </div>

      {q.isLoading && <p className="text-ink-muted">Chargement…</p>}
      {q.isError && <ErrorNote message={errorMessage(q.error)} />}
      {q.isSuccess && posts.length === 0 && (
        <Card>
          <p className="text-ink-muted">
            {tab === "feed" ? "Aucun look pour le moment. Soyez la première à publier !" : "Vous n'avez rien publié. Après un essayage ou une coiffure, touchez « Publier »."}
          </p>
        </Card>
      )}

      <ul className="grid gap-lg sm:grid-cols-2">
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} />
          </li>
        ))}
      </ul>

      {q.hasNextPage && (
        <Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage} className="w-full">Voir plus</Button>
      )}
    </Screen>
  );
}
