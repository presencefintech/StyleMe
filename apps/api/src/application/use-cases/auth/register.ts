import { err, ok, REFERRAL, type Result } from "@styleme/shared";
import { User } from "../../../domain/entities/user";
import { DomainError, EmailAlreadyUsed, InvalidEmail, WeakPassword } from "../../../domain/errors";
import type { CreditLedgerRepository, IdGenerator, PasswordHasher, TokenService, UserRepository } from "../../../domain/ports";
import { Email } from "../../../domain/value-objects/email";

export const MIN_PASSWORD_LENGTH = 8;
const CODE_ATTEMPTS = 5;

export class Register {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly ids: IdGenerator,
    private readonly ledger: CreditLedgerRepository,
  ) {}

  async execute(input: { email: string; password: string; referralCode?: string }): Promise<Result<{ accessToken: string; user: User }, DomainError>> {
    let email: Email;
    try {
      email = Email.of(input.email);
    } catch (e) {
      if (e instanceof InvalidEmail) return err(e);
      throw e;
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) return err(new WeakPassword(`Minimum ${MIN_PASSWORD_LENGTH} caractères`));
    if (await this.users.findByEmail(email.value)) return err(new EmailAlreadyUsed());

    // Un code inconnu est ignoré : il ne doit jamais bloquer l'inscription.
    const referrer = input.referralCode ? await this.users.findByReferralCode(input.referralCode.trim().toUpperCase()) : null;

    const user = User.create({
      id: this.ids.next(),
      email,
      passwordHash: await this.hasher.hash(input.password),
      referralCode: await this.freeReferralCode(),
      referredById: referrer?.id,
    });
    await this.users.save(user);

    await this.ledger.append({ userId: user.id, amount: REFERRAL.signupBonus, reason: "signup-bonus" });
    if (referrer && (await this.users.countReferrals(referrer.id)) <= REFERRAL.maxRewardedReferrals) {
      // Le filleul vient d'être enregistré : il est déjà compté, d'où `<=`.
      await this.ledger.append({ userId: referrer.id, amount: REFERRAL.referrerBonus, reason: `referral-bonus:${user.id}` });
    }
    return ok({ accessToken: await this.tokens.issue(user.id), user });
  }

  private async freeReferralCode(): Promise<string> {
    for (let i = 0; i < CODE_ATTEMPTS; i++) {
      const code = User.codeFrom(this.ids.next());
      if (!(await this.users.findByReferralCode(code))) return code;
    }
    throw new Error("Impossible de générer un code de parrainage unique");
  }
}
