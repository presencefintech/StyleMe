import { Email } from "../value-objects/email";

export class User {
  private constructor(
    public readonly id: string,
    public readonly email: Email,
    public readonly passwordHash: string,
    private _ageConfirmedAt?: Date,
  ) {}
  static create(p: { id: string; email: Email; passwordHash: string }): User {
    return new User(p.id, p.email, p.passwordHash);
  }
  static restore(p: { id: string; email: Email; passwordHash: string; ageConfirmedAt?: Date }): User {
    return new User(p.id, p.email, p.passwordHash, p.ageConfirmedAt);
  }

  get ageConfirmedAt() { return this._ageConfirmedAt; }
  get isAgeConfirmed() { return this._ageConfirmedAt !== undefined; }
  confirmAge(at: Date) {
    if (!this._ageConfirmedAt) this._ageConfirmedAt = at;
  }
}
