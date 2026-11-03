import { err, HAIRSTYLES, MAKEUPS, MAX_CAPTION_LENGTH, ok, type PostVisibility, type Result } from "@styleme/shared";
import { AgeNotConfirmed, DomainError, InvalidPrompt, JobNotFound, PostNotFound, UserNotFound } from "../../../domain/errors";
import type { IdGenerator, JobRepository, PostWithStats, PostRepository, StorageService, UserRepository } from "../../../domain/ports";
import { RESULTS_BUCKET } from "../jobs/get-job";

const IMAGE_TTL_SECONDS = 3600;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;

/** Ce que voit l'app. Jamais d'email ni d'identifiant d'auteure : un look est publié sans nom. */
export interface PostView {
  id: string;
  imageUrl: string;
  caption?: string;
  visibility: PostVisibility;
  /** Paramètres du look, pour « Essayer ce look » (références du catalogue, jamais la photo de l'auteure). */
  look: { garmentId?: string; hairstyleId?: string; hairstyleName?: string; makeupId?: string; makeupName?: string; accessoryIds: string[]; occasionId?: string };
  likeCount: number;
  likedByMe: boolean;
  mine: boolean;
  /** Masqué du fil par des signalements ; seule son auteure le voit encore. */
  hidden: boolean;
  createdAt: string;
}

async function toView(p: PostWithStats, viewerId: string, storage: StorageService): Promise<PostView> {
  const { url } = await storage.presignDownload({ bucket: RESULTS_BUCKET, key: p.imageKey }, IMAGE_TTL_SECONDS);
  return {
    id: p.id,
    imageUrl: url,
    ...(p.caption ? { caption: p.caption } : {}),
    visibility: p.visibility,
    look: {
      garmentId: p.garmentId,
      hairstyleId: p.hairstyleId,
      hairstyleName: HAIRSTYLES.find((h) => h.id === p.hairstyleId)?.name,
      makeupId: p.makeupId,
      makeupName: MAKEUPS.find((m) => m.id === p.makeupId)?.name,
      accessoryIds: p.accessoryIds,
      occasionId: p.occasionId,
    },
    likeCount: p.likeCount,
    likedByMe: p.likedByMe,
    mine: p.userId === viewerId,
    hidden: p.hidden,
    createdAt: p.createdAt.toISOString(),
  };
}

const clampLimit = (n?: number) => Math.min(Math.max(n ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

/** Un post est visible s'il n'est pas masqué (ou si c'est le sien). PUBLIC et UNLISTED sont lisibles par lien. */
const visibleTo = (p: PostWithStats, viewerId: string) => p.userId === viewerId || !p.hidden;

async function requireAdult(users: UserRepository, userId: string): Promise<DomainError | null> {
  const user = await users.findById(userId);
  if (!user) return new UserNotFound();
  return user.isAgeConfirmed ? null : new AgeNotConfirmed();
}

/** Publie le résultat d'un job terminé. Republier le même job met à jour la visibilité et la légende. */
export class PublishPost {
  constructor(
    private readonly users: UserRepository,
    private readonly jobs: JobRepository,
    private readonly posts: PostRepository,
    private readonly storage: StorageService,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: { userId: string; jobId: string; visibility: PostVisibility; caption?: string }): Promise<Result<PostView, DomainError>> {
    const denied = await requireAdult(this.users, input.userId);
    if (denied) return err(denied);
    const caption = input.caption?.trim() || undefined;
    if (caption && caption.length > MAX_CAPTION_LENGTH) return err(new InvalidPrompt());

    const job = await this.jobs.findById(input.jobId);
    const outputKey = job?.outputAssetIds[0];
    // 404 aussi pour le job d'un autre : on ne révèle pas son existence.
    if (!job || job.userId !== input.userId || job.status !== "DONE" || !outputKey) return err(new JobNotFound());

    const existing = await this.posts.findByJob(input.userId, input.jobId);
    const id = existing?.id ?? this.ids.next();
    const ext = /\.([a-z0-9]+)$/i.exec(outputKey)?.[1] ?? "png";
    const imageKey = existing?.imageKey ?? `${input.userId}/post-${id}.${ext}`;
    // Copie dans le dossier de l'auteure : elle survit à la purge du résultat d'origine et part avec le compte.
    if (!existing) await this.storage.copy({ bucket: RESULTS_BUCKET, key: outputKey }, { bucket: RESULTS_BUCKET, key: imageKey });

    await this.posts.save({
      id, userId: input.userId, jobId: input.jobId, imageKey, visibility: input.visibility, caption,
      garmentId: job.garmentId, hairstyleId: job.hairstyleId, makeupId: job.makeupId, accessoryIds: job.accessoryIds,
      occasionId: job.type === "LOOK" ? job.styleId : undefined, createdAt: existing?.createdAt ?? new Date(),
    });
    const saved = await this.posts.findById(id, input.userId);
    return ok(await toView(saved!, input.userId, this.storage));
  }
}

/** Retire un look du fil : la ligne ET la copie de l'image sont supprimées. */
export class UnpublishPost {
  constructor(
    private readonly posts: PostRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(input: { userId: string; postId: string }): Promise<Result<void, DomainError>> {
    const post = await this.posts.findById(input.postId, input.userId);
    if (!post || post.userId !== input.userId) return err(new PostNotFound());
    await this.storage.delete({ bucket: RESULTS_BUCKET, key: post.imageKey });
    await this.posts.delete(post.id);
    return ok(undefined);
  }
}

export class ListFeed {
  constructor(
    private readonly users: UserRepository,
    private readonly posts: PostRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(input: { userId: string; cursor?: string; limit?: number }): Promise<Result<{ items: PostView[]; nextCursor: string | null }, DomainError>> {
    const denied = await requireAdult(this.users, input.userId);
    if (denied) return err(denied);
    const page = await this.posts.listPublic(input.userId, { cursor: input.cursor, limit: clampLimit(input.limit) });
    return ok({ items: await Promise.all(page.items.map((p) => toView(p, input.userId, this.storage))), nextCursor: page.nextCursor });
  }
}

export class ListMyPosts {
  constructor(
    private readonly posts: PostRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(input: { userId: string; cursor?: string; limit?: number }): Promise<Result<{ items: PostView[]; nextCursor: string | null }, DomainError>> {
    const page = await this.posts.listByUser(input.userId, { cursor: input.cursor, limit: clampLimit(input.limit) });
    return ok({ items: await Promise.all(page.items.map((p) => toView(p, input.userId, this.storage))), nextCursor: page.nextCursor });
  }
}

export class GetPost {
  constructor(
    private readonly posts: PostRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(input: { userId: string; postId: string }): Promise<Result<PostView, DomainError>> {
    const post = await this.posts.findById(input.postId, input.userId);
    if (!post || !visibleTo(post, input.userId)) return err(new PostNotFound());
    return ok(await toView(post, input.userId, this.storage));
  }
}

export class SetPostLike {
  constructor(private readonly posts: PostRepository) {}

  async execute(input: { userId: string; postId: string; liked: boolean }): Promise<Result<void, DomainError>> {
    const post = await this.posts.findById(input.postId, input.userId);
    if (!post || !visibleTo(post, input.userId)) return err(new PostNotFound());
    await this.posts.setLike(post.id, input.userId, input.liked);
    return ok(undefined);
  }
}

export class ReportPost {
  constructor(private readonly posts: PostRepository) {}

  async execute(input: { userId: string; postId: string; reason: string }): Promise<Result<void, DomainError>> {
    const post = await this.posts.findById(input.postId, input.userId);
    if (!post || !visibleTo(post, input.userId)) return err(new PostNotFound());
    // On ne signale pas son propre look : inutile, et ça permettrait de se masquer de force un look.
    if (post.userId === input.userId) return ok(undefined);
    await this.posts.addReport(post.id, input.userId, input.reason);
    return ok(undefined);
  }
}
