"use client";

import Link from "next/link";
import { use } from "react";
import { PostCard } from "@/components/post-card";
import { Card, ErrorNote, Screen } from "@/components/ui";
import { ApiError, errorMessage } from "@/lib/api";
import { usePost } from "@/features/queries";

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const post = usePost(id);
  const gone = post.error instanceof ApiError && post.error.status === 404;

  return (
    <Screen title="Un look">
      <Link href="/feed" className="text-caption text-ink-muted hover:text-ink">← Retour au fil</Link>
      {post.isLoading && <p className="text-ink-muted">Chargement…</p>}
      {gone && <Card><p className="text-ink-muted">Ce look n'existe plus ou a été retiré.</p></Card>}
      {post.isError && !gone && <ErrorNote message={errorMessage(post.error)} />}
      {post.data && <PostCard post={post.data} onChanged={() => window.location.assign("/feed")} />}
    </Screen>
  );
}
