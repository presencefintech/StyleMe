import { err, ok, type Result } from "@styleme/shared";
import { DomainError, UserNotFound } from "../../../domain/errors";
import type { Clock, UserRepository } from "../../../domain/ports";

export class ConfirmAge {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { userId: string }): Promise<Result<void, DomainError>> {
    const user = await this.users.findById(input.userId);
    if (!user) return err(new UserNotFound());
    user.confirmAge(this.clock.now());
    await this.users.save(user);
    return ok(undefined);
  }
}
