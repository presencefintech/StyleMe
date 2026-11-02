import { InvalidPhoneNumber } from "../errors";

const E164 = /^\+[1-9]\d{7,14}$/;

export class PhoneNumber {
  private constructor(public readonly value: string) {}
  static of(raw: string): PhoneNumber {
    const v = raw.replace(/[\s-]/g, "");
    if (!E164.test(v)) throw new InvalidPhoneNumber(`Invalid phone: ${raw}`);
    return new PhoneNumber(v);
  }
}
