export class CreditAmount {
  private constructor(public readonly value: number) {}
  static of(value: number): CreditAmount {
    if (!Number.isInteger(value)) throw new Error("CreditAmount must be integer");
    return new CreditAmount(value);
  }
  isGreaterOrEqual(other: CreditAmount): boolean {
    return this.value >= other.value;
  }
  add(other: CreditAmount): CreditAmount {
    return CreditAmount.of(this.value + other.value);
  }
  subtract(other: CreditAmount): CreditAmount {
    return CreditAmount.of(this.value - other.value);
  }
}
