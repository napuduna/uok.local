import { createHash } from "node:crypto";

import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  Role,
  type CreateExportRequest,
  type ExportJobResponse,
  type ExportReportType,
  type RoleValue
} from "@warehouse/contracts";
import { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";
import { ExportReportSnapshotService } from "./export-report-snapshot.service";
import { ExportQueueService } from "./export-queue.service";

const ARTIFACT_TTL_MS = 24 * 60 * 60 * 1_000;

interface CreateExportContext {
  actorId: string;
  role: RoleValue;
  idempotencyKey: string;
  requestId?: string | undefined;
  now?: Date | undefined;
}

export interface ExportAccessContext {
  actorId: string;
  role: RoleValue;
}

type ExportJobRecord = Prisma.ExportJobGetPayload<Record<string, never>>;

@Injectable()
export class ExportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly reports: ExportReportSnapshotService,
    private readonly queue: ExportQueueService
  ) {}

  requestHash(input: CreateExportRequest): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  }

  async create(
    input: CreateExportRequest,
    context: CreateExportContext
  ): Promise<ExportJobResponse> {
    this.assertCanExport(input.reportType, context.role);
    const requestHash = this.requestHash(input);
    const existing = await this.database.client.exportJob.findUnique({
      where: { idempotencyKey: context.idempotencyKey }
    });
    if (existing) {
      if (
        existing.requestHash !== requestHash ||
        existing.requestedById !== context.actorId
      ) {
        throw this.idempotencyConflict();
      }
      return mapExportJob(existing);
    }

    const snapshot = await this.reports.exportSnapshot(
      input.reportType,
      input.filters,
      {
        actorId: context.actorId,
        role: context.role
      }
    );
    const now = context.now ?? new Date();
    const expiresAt = new Date(now.getTime() + ARTIFACT_TTL_MS);
    let created: ExportJobRecord;
    try {
      created = await this.database.client.$transaction(async (transaction) => {
        const exportJob = await transaction.exportJob.create({
          data: {
            reportType: input.reportType,
            format: input.format,
            requestedById: context.actorId,
            requestedRole: context.role,
            filters: input.filters,
            resultSnapshot: snapshot as Prisma.InputJsonValue,
            idempotencyKey: context.idempotencyKey,
            requestHash,
            expiresAt,
            ...(context.requestId ? { requestId: context.requestId } : {})
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: context.actorId,
            action: "EXPORT_REQUESTED",
            resourceType: "EXPORT_JOB",
            resourceId: exportJob.id,
            ...(context.requestId ? { requestId: context.requestId } : {}),
            after: {
              reportType: input.reportType,
              format: input.format,
              filters: input.filters,
              expiresAt: expiresAt.toISOString()
            }
          }
        });
        return exportJob;
      });
    } catch (error) {
      if (hasErrorCode(error, "P2002")) {
        const winner = await this.database.client.exportJob.findUnique({
          where: { idempotencyKey: context.idempotencyKey }
        });
        if (winner) {
          if (
            winner.requestHash !== requestHash ||
            winner.requestedById !== context.actorId
          ) {
            throw this.idempotencyConflict();
          }
          return mapExportJob(winner);
        }
      }
      throw error;
    }

    try {
      await this.queue.enqueue(created.id);
      return mapExportJob(created);
    } catch {
      const failedAt = new Date();
      const failed = await this.database.client.$transaction(
        async (transaction) => {
          const exportJob = await transaction.exportJob.update({
            where: { id: created.id },
            data: {
              status: "FAILED",
              safeErrorCode: "EXPORT_QUEUE_UNAVAILABLE",
              safeErrorMessage: "ไม่สามารถส่งงาน Export เข้าคิวได้",
              failedAt
            }
          });
          await transaction.auditLog.create({
            data: {
              actorId: context.actorId,
              action: "EXPORT_FAILED",
              resourceType: "EXPORT_JOB",
              resourceId: created.id,
              ...(context.requestId ? { requestId: context.requestId } : {}),
              metadata: {
                errorCode: "EXPORT_QUEUE_UNAVAILABLE"
              }
            }
          });
          return exportJob;
        }
      );
      return mapExportJob(failed);
    }
  }

  async get(
    id: string,
    context: ExportAccessContext
  ): Promise<ExportJobResponse> {
    const exportJob = await this.findAccessible(id, context);
    return mapExportJob(exportJob);
  }

  async findAccessible(
    id: string,
    context: ExportAccessContext
  ): Promise<ExportJobRecord> {
    const exportJob = await this.database.client.exportJob.findUnique({
      where: { id }
    });
    if (!exportJob) {
      throw new NotFoundException({
        code: "EXPORT_NOT_FOUND",
        message: "ไม่พบงาน Export"
      });
    }
    if (
      exportJob.requestedById !== context.actorId &&
      context.role !== Role.ADMIN &&
      context.role !== Role.MANAGER
    ) {
      throw new ForbiddenException({
        code: "EXPORT_ACCESS_DENIED",
        message: "ไม่มีสิทธิ์เข้าถึงงาน Export นี้"
      });
    }
    return exportJob;
  }

  async getDownload(
    id: string,
    context: ExportAccessContext,
    now = new Date()
  ): Promise<{
    artifactPath: string;
    fileName: string;
    contentType: string;
  }> {
    const exportJob = await this.findAccessible(id, context);
    if (exportJob.status === "EXPIRED" || exportJob.expiresAt <= now) {
      throw new GoneException({
        code: "EXPORT_EXPIRED",
        message: "Export file has expired"
      });
    }
    if (
      exportJob.status !== "COMPLETED" ||
      !exportJob.artifactPath ||
      !exportJob.fileName ||
      !exportJob.contentType
    ) {
      throw new ConflictException({
        code: "EXPORT_NOT_READY",
        message: "Export file is not ready for download"
      });
    }
    return {
      artifactPath: exportJob.artifactPath,
      fileName: exportJob.fileName,
      contentType: exportJob.contentType
    };
  }
  private assertCanExport(reportType: ExportReportType, role: RoleValue): void {
    if (role === Role.ADMIN || role === Role.MANAGER) {
      return;
    }
    if (
      role === Role.SALES &&
      (reportType === "SALES" ||
        reportType === "GROSS_PROFIT" ||
        reportType === "TOP_CUSTOMERS")
    ) {
      return;
    }
    if (
      role === Role.WAREHOUSE &&
      (reportType === "INVENTORY_CURRENT" ||
        reportType === "INVENTORY_LOW_STOCK" ||
        reportType === "INVENTORY_EXPIRY")
    ) {
      return;
    }
    throw new ForbiddenException({
      code: "EXPORT_SCOPE_DENIED",
      message: "ไม่มีสิทธิ์ Export รายงานประเภทนี้"
    });
  }

  private idempotencyConflict(): ConflictException {
    return new ConflictException({
      code: "IDEMPOTENCY_KEY_REUSED",
      message: "Idempotency-Key นี้ถูกใช้กับข้อมูลอื่นแล้ว"
    });
  }
}

function mapExportJob(exportJob: ExportJobRecord): ExportJobResponse {
  return {
    id: exportJob.id,
    reportType: exportJob.reportType,
    format: exportJob.format,
    status: exportJob.status,
    filters: exportJob.filters as Record<string, unknown>,
    fileName: exportJob.fileName,
    contentType: exportJob.contentType,
    fileChecksum: exportJob.fileChecksum,
    fileSizeBytes: exportJob.fileSizeBytes,
    expiresAt: exportJob.expiresAt.toISOString(),
    completedAt: exportJob.completedAt?.toISOString() ?? null,
    safeError:
      exportJob.safeErrorCode && exportJob.safeErrorMessage
        ? {
            code: exportJob.safeErrorCode,
            message: exportJob.safeErrorMessage
          }
        : null,
    createdAt: exportJob.createdAt.toISOString(),
    updatedAt: exportJob.updatedAt.toISOString()
  };
}
function hasErrorCode(error: unknown, expectedCode: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && error.code === expectedCode) {
    return true;
  }
  return "cause" in error && hasErrorCode(error.cause, expectedCode);
}
