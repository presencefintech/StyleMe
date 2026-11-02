import { err, ok, type Result } from "@styleme/shared";
import { User } from "../../../domain/entities/user";
import { DomainError, EmailAlreadyUsed, InvalidEmail, WeakPassword } from "../../../domain/errors";
import type { IdGenerator, PasswordHasher, TokenService, UserRepository } from "../../../domain/ports";
import { Email } from "../../../domain/value-objects/email";

export const MIN_PASSWORD_LENGTH = 8;

export class Register {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: { email: string; password: string }): Promise<Result<{ accessToken: string; user: User }, DomainError>> {
    let email: Email;
    try {
      email = Email.of(input.email);
    } catch (e) {
      if (e instanceof InvalidEmail) return err(e);
      throw e;
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) return err(new WeakPassword(`Minimum ${MIN_PASSWORD_LENGTH} caractères`));
    if (await this.users.findByEmail(email.value)) return err(new EmailAlreadyUsed());

    const user = User.create({ id: this.ids.next(), email, passwordHash: await this.hasher.hash(input.password) });
    await this.users.save(user);
    return ok({ accessToken: await this.tokens.issue(user.id), user });
  }
}
