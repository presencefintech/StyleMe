import { err, ok, REFERRAL, type Result } from "@styleme/shared";
import { DomainError, UserNotFound } from "../../../domain/errors";
import type { UserRepository } from "../../../domain/ports";

export interface ReferralInfo {
  code: string;
  referrals: number;
  signupBonus: number;
  referrerBonus: number;
  maxRewardedReferrals: number;
}

export class GetReferralInfo {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<Result<ReferralInfo, DomainError>> {
    const user = await this.users.findById(userId);
    if (!user) return err(new UserNotFound());
    return ok({ code: user.referralCode, referrals: await this.users.countReferrals(userId), ...REFERRAL });
  }
}
