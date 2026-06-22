import { rm } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;

@Injectable()
export class ExportCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportCleanupService.name);
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly database: DatabaseService) {}

  onModuleInit(): void {
    void this.cleanup();
    this.interval = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async cleanup(): Promise<void> {
    const jobs = await this.database.client.exportJob.findMany({
      where: {
        status: "COMPLETED",
        expiresAt: { lte: new Date() }
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: 100
    });

    for (const job of jobs) {
      try {
        if (
          job.artifactPath &&
          basename(job.artifactPath) === job.artifactPath
        ) {
          await rm(resolve(exportDirectory(), job.artifactPath), {
            force: true
          });
        }
        await this.database.client.$transaction(async (transaction) => {
          await transaction.exportJob.update({
            where: { id: job.id },
            data: {
              status: "EXPIRED",
              artifactPath: null,
              fileName: null,
              mimeType: null,
              checksum: null,
              sizeBytes: null
            }
          });
          await transaction.auditLog.create({
            data: {
              actorId: job.requesterId,
              action: "EXPORT_EXPIRED",
              resourceType: "EXPORT_JOB",
              resourceId: job.id,
              after: {
                expiredAt: new Date().toISOString()
              }
            }
          });
        });
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            event: "export_cleanup_failed",
            exportJobId: job.id,
            message: error instanceof Error ? error.message : "Unknown error"
          })
        );
      }
    }
  }
}

function exportDirectory(): string {
  return resolve(
    process.env.EXPORT_ARTIFACT_DIR ?? "/var/lib/warehouse/exports"
  );
}
