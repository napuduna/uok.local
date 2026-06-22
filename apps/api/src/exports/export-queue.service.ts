import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";

import type { ExportQueuePayload } from "@warehouse/contracts";

export const EXPORT_QUEUE_NAME = "warehouse-exports";

function redisConnection() {
  const redisUrl = new URL(process.env.REDIS_URL ?? "redis://redis:6379");
  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    ...(redisUrl.username ? { username: redisUrl.username } : {}),
    ...(redisUrl.password ? { password: redisUrl.password } : {}),
    ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {})
  };
}

@Injectable()
export class ExportQueueService implements OnModuleDestroy {
  private readonly queue = new Queue<ExportQueuePayload>(EXPORT_QUEUE_NAME, {
    connection: redisConnection()
  });

  async enqueue(exportJobId: string): Promise<void> {
    const existing = await this.queue.getJob(exportJobId);
    if (existing) {
      if ((await existing.getState()) === "failed") {
        await existing.retry();
      }
      return;
    }
    await this.queue.add(
      "generate-export",
      { exportJobId },
      {
        jobId: exportJobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: false,
        removeOnFail: false
      }
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
