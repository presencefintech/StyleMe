import { Email } from "../value-objects/email";

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: Email,
    public readonly passwordHash: string,
    public readonly referralCode: string,
    public readonly referredById?: string,
    private _ageConfirmedAt?: Date,
  ) {}
  /** Sans code explicite, le code de parrainage est dérivé de l'id (8 caractères alphanumériques majuscules). */
  static create(p: { id: string; email: Email; passwordHash: string; referralCode?: string; referredById?: string }): User {
    return new User(p.id, p.email, p.passwordHash, p.referralCode ?? User.codeFrom(p.id), p.referredById);
  }
  static restore(p: { id: string; email: Email; passwordHash: string; referralCode: string; referredById?: string; ageConfirmedAt?: Date }): User {
    return new User(p.id, p.email, p.passwordHash, p.referralCode, p.referredById, p.ageConfirmedAt);
  }
  static codeFrom(seed: string): string {
    return seed.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  }

  get ageConfirmedAt() { return this._ageConfirmedAt; }
  get isAgeConfirmed() { return this._ageConfirmedAt !== undefined; }
  confirmAge(at: Date) {
    if (!this._ageConfirmedAt) this._ageConfirmedAt = at;
  }
}
