import { ok, type Result } from "@styleme/shared";
import type { DomainError } from "../../../domain/errors";
import type { StyleRepository, StyleSummary } from "../../../domain/ports";

export class ListStyles {
  constructor(private readonly styles: StyleRepository) {}
  async execute(): Promise<Result<StyleSummary[], DomainError>> {
    return ok(await this.styles.listActive());
  }
}
