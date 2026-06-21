import { rm } from "node:fs/promises";

import { Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { ExportArtifactGenerator } from "./export-artifact.generator";
import { ExportRuntimeConfigService } from "./export-runtime-config.service";

@Injectable()
export class ExportProcessorService {
  constructor(
    private readonly database: DatabaseService,
    private readonly generator: ExportArtifactGenerator,
    private readonly runtime: ExportRuntimeConfigService
  ) {}

  async process(exportJobId: string): Promise<void> {
    const exportJob = await this.database.client.exportJob.findUnique({
      where: { id: exportJobId }
    });
    if (!exportJob) {
      throw new NotFoundException("Export job was not found");
    }
    if (exportJob.status === "COMPLETED") {
      return;
    }

    await this.database.client.exportJob.update({
      where: { id: exportJob.id },
      data: {
        status: "PROCESSING",
        safeErrorCode: null,
        safeErrorMessage: null,
        failedAt: null
      }
    });

    try {
      const artifact = await this.generator.generate({
        exportJobId: exportJob.id,
        reportType: exportJob.reportType,
        format: exportJob.format,
        snapshot: exportJob.resultSnapshot,
        outputDirectory: this.runtime.artifactDirectory,
        thaiFontPath: this.runtime.thaiFontPath
      });
      const completedAt = new Date();
      await this.database.client.$transaction(async (transaction) => {
        await transaction.exportJob.update({
          where: { id: exportJob.id },
          data: {
            status: "COMPLETED",
            artifactPath: artifact.artifactPath,
            fileName: artifact.fileName,
            contentType: artifact.contentType,
            fileChecksum: artifact.fileChecksum,
            fileSizeBytes: artifact.fileSizeBytes,
            safeErrorCode: null,
            safeErrorMessage: null,
            completedAt
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: exportJob.requestedById,
            action: "EXPORT_COMPLETED",
            resourceType: "EXPORT_JOB",
            resourceId: exportJob.id,
            metadata: {
              fileName: artifact.fileName,
              fileChecksum: artifact.fileChecksum,
              fileSizeBytes: artifact.fileSizeBytes,
              completedAt: completedAt.toISOString()
            }
          }
        });
      });
    } catch {
      const failedAt = new Date();
      await this.database.client.$transaction(async (transaction) => {
        await transaction.exportJob.update({
          where: { id: exportJob.id },
          data: {
            status: "FAILED",
            safeErrorCode: "EXPORT_GENERATION_FAILED",
            safeErrorMessage: "ไม่สามารถสร้างไฟล์ Export ได้",
            failedAt
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: exportJob.requestedById,
            action: "EXPORT_FAILED",
            resourceType: "EXPORT_JOB",
            resourceId: exportJob.id,
            metadata: {
              errorCode: "EXPORT_GENERATION_FAILED",
              failedAt: failedAt.toISOString()
            }
          }
        });
      });
      throw new Error("Export generation failed");
    }
  }

  async cleanupExpired(now = new Date()): Promise<number> {
    const expired = await this.database.client.exportJob.findMany({
      where: {
        status: "COMPLETED",
        expiresAt: { lte: now },
        artifactPath: { not: null }
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }]
    });
    for (const exportJob of expired) {
      if (exportJob.artifactPath) {
        await rm(exportJob.artifactPath, { force: true });
      }
      await this.database.client.$transaction(async (transaction) => {
        await transaction.exportJob.update({
          where: { id: exportJob.id },
          data: {
            status: "EXPIRED",
            artifactPath: null,
            expiredAt: now
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: exportJob.requestedById,
            action: "EXPORT_EXPIRED",
            resourceType: "EXPORT_JOB",
            resourceId: exportJob.id,
            metadata: {
              fileChecksum: exportJob.fileChecksum
            }
          }
        });
      });
    }
    return expired.length;
  }
}
