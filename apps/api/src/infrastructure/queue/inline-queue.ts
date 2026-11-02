import type { RunEnhancementJob } from "../../application";
import type { JobQueue, PushService } from "../../domain/ports";

const MAX_ATTEMPTS = 3;

/**
 * File en mémoire pour le DÉVELOPPEMENT (sans Redis). Même logique de retry que le worker BullMQ,
 * mais rien n'est persisté : un redémarrage de l'API perd les jobs en attente. Ne pas utiliser en production.
 */
export class InlineJobQueue implements JobQueue {
  constructor(
    private readonly runJob: RunEnhancementJob,
    private readonly push: PushService,
    private readonly log: (m: string) => void = () => {},
  ) {}

  async enqueue(jobId: string) {
    setImmediate(() => void this.process(jobId, 1));
  }

  private async process(jobId: string, attempt: number): Promise<void> {
    try {
      const result = await this.runJob.execute(jobId, { isLastAttempt: attempt >= MAX_ATTEMPTS });
      if (!result.ok) {
        if (result.error.name === "ProviderFailure" && attempt < MAX_ATTEMPTS) {
          setTimeout(() => void this.process(jobId, attempt + 1), 5000 * attempt);
          return;
        }
        this.log(`job ${jobId} not processed: ${result.error.name}: ${result.error.message}`);
        return;
      }
      await this.push.notifyJobReady(jobId);
    } catch (e) {
      this.log(`job ${jobId} crashed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
