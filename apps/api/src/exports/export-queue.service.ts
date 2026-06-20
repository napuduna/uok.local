import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { Queue, type ConnectionOptions } from "bullmq";

import { parseApiEnvironment } from "@warehouse/config";

export const EXPORT_QUEUE_NAME = "report-exports";
export const GENERATE_EXPORT_JOB = "generate-export";

export interface GenerateExportJobData {
  exportJobId: string;
}

@Injectable()
export class ExportQueueService implements OnApplicationShutdown {
  private readonly queue: Queue;

  constructor() {
    const environment = parseApiEnvironment(process.env);
    this.queue = new Queue(EXPORT_QUEUE_NAME, {
      connection: redisConnectionOptions(environment.REDIS_URL)
    });
  }

  async enqueue(exportJobId: string): Promise<void> {
    await this.queue.add(
      GENERATE_EXPORT_JOB,
      { exportJobId } satisfies GenerateExportJobData,
      {
        jobId: exportJobId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1_000
        },
        removeOnComplete: 1_000,
        removeOnFail: 1_000
      }
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}

export function redisConnectionOptions(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  const database = Number(url.pathname.replace(/^\//, "") || "0");
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    db: database,
    maxRetriesPerRequest: 1,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {})
  };
}