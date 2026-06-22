import {
  Injectable,
  type OnApplicationShutdown,
  type OnModuleInit
} from "@nestjs/common";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";

import { ExportProcessorService } from "./export-processor.service";
import { ExportRuntimeConfigService } from "./export-runtime-config.service";

export const EXPORT_QUEUE_NAME = "report-exports";
export const GENERATE_EXPORT_JOB = "generate-export";
export const CLEANUP_EXPORTS_JOB = "cleanup-expired-exports";

interface GenerateExportJobData {
  exportJobId: string;
}

@Injectable()
export class ExportQueueWorker implements OnModuleInit, OnApplicationShutdown {
  private queue: Queue | undefined;
  private worker: Worker | undefined;

  constructor(
    private readonly processor: ExportProcessorService,
    private readonly runtime: ExportRuntimeConfigService
  ) {}

  async onModuleInit(): Promise<void> {
    const producerConnection = redisConnectionOptions(this.runtime.redisUrl, 1);
    const workerConnection = redisConnectionOptions(
      this.runtime.redisUrl,
      null
    );
    this.queue = new Queue(EXPORT_QUEUE_NAME, {
      connection: producerConnection
    });
    await this.queue.upsertJobScheduler(
      CLEANUP_EXPORTS_JOB,
      { every: 60 * 60 * 1_000 },
      {
        name: CLEANUP_EXPORTS_JOB,
        data: {},
        opts: {
          removeOnComplete: 100,
          removeOnFail: 100
        }
      }
    );
    this.worker = new Worker(EXPORT_QUEUE_NAME, (job) => this.processJob(job), {
      connection: workerConnection,
      concurrency: 2
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  private async processJob(job: Job): Promise<void> {
    if (job.name === GENERATE_EXPORT_JOB) {
      const data = job.data as Partial<GenerateExportJobData>;
      if (typeof data.exportJobId !== "string") {
        throw new Error("Invalid export job data");
      }
      await this.processor.process(data.exportJobId);
      return;
    }
    if (job.name === CLEANUP_EXPORTS_JOB) {
      await this.processor.cleanupExpired();
      return;
    }
    throw new Error(`Unsupported export job: ${job.name}`);
  }
}

function redisConnectionOptions(
  redisUrl: string,
  maxRetriesPerRequest: number | null
): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "6379"),
    db: Number(url.pathname.replace(/^\//, "") || "0"),
    maxRetriesPerRequest,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {})
  };
}
