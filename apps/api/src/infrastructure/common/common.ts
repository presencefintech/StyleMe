import { randomUUID } from "node:crypto";
import { Logger } from "@nestjs/common";
import type { Clock, IdGenerator, PushService } from "../../domain/ports";

export class UuidGenerator implements IdGenerator {
  next() { return randomUUID(); }
}
export class SystemClock implements Clock {
  now() { return new Date(); }
}
/** Placeholder : le push mobile n'existe pas côté web (le front poll le statut). */
export class LogPushService implements PushService {
  private readonly log = new Logger("Push");
  async notifyJobReady(jobId: string) { this.log.log(`job ready: ${jobId}`); }
}
