import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import { Worker } from "bullmq";

import {
  exportQueuePayloadSchema,
  exportSnapshotSchema,
  type ExportQueuePayload
} from "@warehouse/contracts";
import { DatabaseService } from "../database/database.service";
import {
  exportMimeTypes,
  renderExportPdf,
  renderExportWorkbook
} from "./export-renderer";

const EXPORT_QUEUE_NAME = "warehouse-exports";

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
export class ExportWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportWorkerService.name);
  private worker: Worker<ExportQueuePayload> | null = null;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    this.worker = new Worker<ExportQueuePayload>(
      EXPORT_QUEUE_NAME,
      async (job) => {
        const payload = exportQueuePayloadSchema.parse(job.data);
        await this.processExport(payload.exportJobId);
      },
      {
        connection: redisConnection(),
        concurrency: Number(process.env.EXPORT_WORKER_CONCURRENCY ?? 2)
      }
    );
    this.worker.on("failed", (job, error) => {
      this.logger.error(
        JSON.stringify({
          event: "export_job_failed",
          exportJobId: job?.data.exportJobId,
          message: error.message
        })
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  async processExport(exportJobId: string): Promise<void> {
    const job = await this.database.client.exportJob.findUnique({
      where: { id: exportJobId }
    });
    if (!job || job.status === "EXPIRED") return;
    if (
      job.status === "COMPLETED" &&
      job.artifactPath &&
      (await artifactExists(job.artifactPath))
    ) {
      return;
    }

    await this.database.client.exportJob.update({
      where: { id: job.id },
      data: {
        status: "PROCESSING",
        startedAt: new Date(),
        failedAt: null,
        errorCode: null,
        errorMessage: null,
        artifactPath: null,
        fileName: null,
        mimeType: null,
        checksum: null,
        sizeBytes: null,
        expiresAt: null,
        completedAt: null
      }
    });

    let temporaryPath: string | null = null;
    let finalPath: string | null = null;
    try {
      const snapshot = exportSnapshotSchema.parse(job.snapshot);
      const artifactDirectory = exportDirectory();
      await mkdir(artifactDirectory, { recursive: true });
      const extension = job.format === "XLSX" ? "xlsx" : "pdf";
      const fileName = `${job.reportType.toLowerCase()}-${job.id}.${extension}`;
      const artifactPath = resolve(artifactDirectory, fileName);
      finalPath = artifactPath;
      temporaryPath = `${artifactPath}.${randomUUID()}.tmp`;
      const data =
        job.format === "XLSX"
          ? await renderExportWorkbook(snapshot)
          : await renderExportPdf(snapshot, {
              fontPath:
                process.env.EXPORT_FONT_PATH ??
                "/workspace/apps/worker/assets/fonts/NotoSansThai.ttf"
            });
      await writeFile(temporaryPath, data, { flag: "wx" });
      await rm(artifactPath, { force: true });
      await rename(temporaryPath, artifactPath);
      temporaryPath = null;
      const checksum = createHash("sha256").update(data).digest("hex");
      const completedAt = new Date();
      const retentionHours = positiveInteger(
        process.env.EXPORT_RETENTION_HOURS,
        168
      );
      const expiresAt = new Date(
        completedAt.getTime() + retentionHours * 60 * 60 * 1_000
      );

      await this.database.client.$transaction(async (transaction) => {
        await transaction.exportJob.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            artifactPath: fileName,
            fileName,
            mimeType: exportMimeTypes[job.format],
            checksum,
            sizeBytes: data.byteLength,
            completedAt,
            expiresAt,
            failedAt: null,
            errorCode: null,
            errorMessage: null
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: job.requesterId,
            action: "EXPORT_COMPLETED",
            resourceType: "EXPORT_JOB",
            resourceId: job.id,
            after: {
              format: job.format,
              fileName,
              checksum,
              sizeBytes: data.byteLength,
              expiresAt: expiresAt.toISOString()
            }
          }
        });
      });
    } catch (error) {
      if (temporaryPath) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
      if (finalPath) {
        await rm(finalPath, { force: true }).catch(() => undefined);
      }
      await this.database.client.$transaction(async (transaction) => {
        await transaction.exportJob.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            artifactPath: null,
            fileName: null,
            mimeType: null,
            checksum: null,
            sizeBytes: null,
            expiresAt: null,
            completedAt: null,
            failedAt: new Date(),
            errorCode: "EXPORT_GENERATION_FAILED",
            errorMessage: "Export generation failed"
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: job.requesterId,
            action: "EXPORT_FAILED",
            resourceType: "EXPORT_JOB",
            resourceId: job.id,
            after: {
              errorCode: "EXPORT_GENERATION_FAILED"
            }
          }
        });
      });
      throw error;
    }
  }
}

function exportDirectory(): string {
  return resolve(
    process.env.EXPORT_ARTIFACT_DIR ?? "/var/lib/warehouse/exports"
  );
}

async function artifactExists(artifactPath: string): Promise<boolean> {
  if (basename(artifactPath) !== artifactPath) return false;
  try {
    await access(resolve(exportDirectory(), artifactPath));
    return true;
  } catch {
    return false;
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
