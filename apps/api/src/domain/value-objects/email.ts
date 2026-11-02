import { InvalidEmail } from "../errors";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export class Email {
  private constructor(public readonly value: string) {}
  /** Normalise (trim + minuscules) : un même email ne crée jamais deux comptes. */
  static of(raw: string): Email {
    const v = raw.trim().toLowerCase();
    if (v.length > 254 || !EMAIL.test(v)) throw new InvalidEmail(`Invalid email: ${raw}`);
    return new Email(v);
  }
}
