import { err, ok, type Result } from "@styleme/shared";
import type { User } from "../../../domain/entities/user";
import { DomainError, InvalidCredentials } from "../../../domain/errors";
import type { PasswordHasher, TokenService, UserRepository } from "../../../domain/ports";
import { Email } from "../../../domain/value-objects/email";

export class Login {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: { email: string; password: string }): Promise<Result<{ accessToken: string; user: User }, DomainError>> {
    let normalized: string;
    try {
      normalized = Email.of(input.email).value;
    } catch {
      return err(new InvalidCredentials()); // même réponse qu'un mauvais mot de passe : on ne révèle rien
    }
    const user = await this.users.findByEmail(normalized);
    // Toujours un verify (même sans compte) pour ne pas distinguer "inconnu" de "mauvais mot de passe" par le temps de réponse.
    const valid = await this.hasher.verify(input.password, user?.passwordHash ?? "");
    if (!user || !valid) return err(new InvalidCredentials());
    return ok({ accessToken: await this.tokens.issue(user.id), user });
  }
}
