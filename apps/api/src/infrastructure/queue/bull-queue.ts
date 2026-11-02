import { Queue, Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { RunEnhancementJob } from "../../application";
import type { JobQueue, PushService } from "../../domain/ports";

export const QUEUE_NAME = "jobs";
export const MAX_ATTEMPTS = 3;

export class BullJobQueue implements JobQueue {
  readonly queue: Queue;
  constructor(connection: Redis) {
    this.queue = new Queue(QUEUE_NAME, { connection });
  }
  async enqueue(jobId: string) {
    // jobId BullMQ = id métier → un même job n'est jamais enqueue deux fois.
    await this.queue.add("enhance", { jobId }, { jobId, attempts: MAX_ATTEMPTS, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 });
  }
  close() { return this.queue.close(); }
}

/**
 * Consumer BullMQ. Un échec provider relance le traitement (backoff) ; au dernier essai le job passe FAILED, 0 crédit.
 */
export function createEnhancementWorker(connection: Redis, runJob: RunEnhancementJob, push: PushService, log: (m: string) => void = () => {}) {
  const worker = new Worker<{ jobId: string }>(
    QUEUE_NAME,
    async (job) => {
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const result = await runJob.execute(job.data.jobId, { isLastAttempt });
      if (!result.ok) {
        // Erreur retryable seulement si le job n'est pas encore définitivement échoué.
        if (!isLastAttempt && result.error.name === "ProviderFailure") throw result.error;
        log(`job ${job.data.jobId} not processed: ${result.error.name}`);
        return;
      }
      await push.notifyJobReady(job.data.jobId);
    },
    { connection, concurrency: 2 },
  );
  return worker;
}
