import { err, ok, type Result } from "@styleme/shared";
import { DomainError, PasswordMismatch, UserNotFound } from "../../../domain/errors";
import type { AccountDataRepository, Clock, PasswordHasher, StorageService, UserRepository } from "../../../domain/ports";

/** Buckets où l'on range des photos d'utilisateurs (clés "<userId>/<fichier>"). */
const PHOTO_BUCKETS = ["sources", "results", "selfies-training"] as const;

/**
 * Suppression de compte (droit à l'effacement). Le mot de passe est redemandé.
 * Ordre voulu : les fichiers d'abord, puis la base. Si la suppression des fichiers échoue, rien n'est
 * anonymisé et l'utilisateur peut réessayer, ce qui évite des photos orphelines sans propriétaire connu.
 * Les écritures comptables (crédits, paiements) sont conservées, sans numéro de téléphone.
 */
export class DeleteAccount {
  constructor(
    private readonly users: UserRepository,
    private readonly password: PasswordHasher,
    private readonly storage: StorageService,
    private readonly data: AccountDataRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { userId: string; password: string }): Promise<Result<void, DomainError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err(new UserNotFound());
    if (!(await this.password.verify(input.password, user.passwordHash))) return err(new PasswordMismatch());

    for (const bucket of PHOTO_BUCKETS) await this.storage.deletePrefix(bucket, `${user.id}/`);
    await this.data.erase(user.id, this.clock.now());
    return ok(undefined);
  }
}
