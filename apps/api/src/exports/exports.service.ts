import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import {
  Role,
  type CreateExportRequest,
  type ExportJobResponse,
  type ExportListQuery,
  type ExportReportType,
  type PaginatedExportJobsResponse,
  type RoleValue
} from "@warehouse/contracts";
import { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";
import { ExportQueueService } from "./export-queue.service";
import { ExportSnapshotService } from "./export-snapshot.service";

interface ExportContext {
  actorId: string;
  role: RoleValue;
}

@Injectable()
export class ExportsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly queue: ExportQueueService,
    private readonly snapshots: ExportSnapshotService
  ) {}

  async create(
    input: CreateExportRequest,
    idempotencyKey: string,
    context: ExportContext
  ): Promise<ExportJobResponse> {
    this.assertReportAccess(input.reportType, context.role);
    const requestHash = hashRequest(input, context);
    const existing = await this.database.client.exportJob.findUnique({
      where: { idempotencyKey }
    });
    if (existing) {
      if (
        existing.requesterId !== context.actorId ||
        existing.requestHash !== requestHash
      ) {
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency-Key was already used for another export"
        });
      }
      await this.queue.enqueue(existing.queueJobId);
      return mapJob(existing);
    }

    const snapshot = await this.snapshots.create(input, context);
    const exportJobId = randomUUID();
    const createJob = () =>
      this.database.client.$transaction(async (transaction) => {
        const job = await transaction.exportJob.create({
          data: {
            id: exportJobId,
            reportType: input.reportType,
            format: input.format,
            requesterId: context.actorId,
            filters: input.filters,
            scope: {
              actorId: context.actorId,
              role: context.role
            },
            snapshot: snapshot as Prisma.InputJsonValue,
            idempotencyKey,
            requestHash,
            queueJobId: exportJobId
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: context.actorId,
            action: "EXPORT_REQUESTED",
            resourceType: "EXPORT_JOB",
            resourceId: job.id,
            after: {
              reportType: input.reportType,
              format: input.format,
              filters: input.filters
            }
          }
        });
        return job;
      });

    let created: Awaited<ReturnType<typeof createJob>>;
    try {
      created = await createJob();
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "P2002"
      ) {
        throw error;
      }
      const raced = await this.database.client.exportJob.findUnique({
        where: { idempotencyKey }
      });
      if (!raced) throw error;
      if (
        raced.requesterId !== context.actorId ||
        raced.requestHash !== requestHash
      ) {
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Idempotency-Key was already used for another export"
        });
      }
      await this.queue.enqueue(raced.queueJobId);
      return mapJob(raced);
    }

    try {
      await this.queue.enqueue(created.queueJobId);
    } catch {
      await this.database.client.$transaction(async (transaction) => {
        await transaction.exportJob.update({
          where: { id: created.id },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            errorCode: "EXPORT_QUEUE_UNAVAILABLE",
            errorMessage: "Unable to queue export"
          }
        });
        await transaction.auditLog.create({
          data: {
            actorId: context.actorId,
            action: "EXPORT_FAILED",
            resourceType: "EXPORT_JOB",
            resourceId: created.id,
            after: {
              errorCode: "EXPORT_QUEUE_UNAVAILABLE"
            }
          }
        });
      });
      throw new ConflictException({
        code: "EXPORT_QUEUE_UNAVAILABLE",
        message: "Unable to queue export"
      });
    }
    return mapJob(created);
  }

  async list(
    query: ExportListQuery,
    context: ExportContext
  ): Promise<PaginatedExportJobsResponse> {
    const where = this.visibilityWhere(context);
    const [items, total] = await Promise.all([
      this.database.client.exportJob.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.database.client.exportJob.count({ where })
    ]);
    return {
      items: items.map(mapJob),
      page: query.page,
      pageSize: query.pageSize,
      total
    };
  }

  async get(id: string, context: ExportContext): Promise<ExportJobResponse> {
    return mapJob(await this.findVisible(id, context));
  }

  async download(
    id: string,
    context: ExportContext
  ): Promise<{ data: Buffer; fileName: string; mimeType: string }> {
    const job = await this.findVisible(id, context);
    if (
      job.status !== "COMPLETED" ||
      !job.artifactPath ||
      !job.fileName ||
      !job.mimeType ||
      !job.checksum ||
      !job.expiresAt ||
      job.expiresAt.getTime() <= Date.now()
    ) {
      throw new NotFoundException({
        code: "EXPORT_NOT_AVAILABLE",
        message: "Export artifact is not available"
      });
    }
    const artifactDirectory = resolve(
      process.env.EXPORT_ARTIFACT_DIR ?? "/var/lib/warehouse/exports"
    );
    if (basename(job.artifactPath) !== job.artifactPath) {
      throw new NotFoundException({
        code: "EXPORT_NOT_AVAILABLE",
        message: "Export artifact is not available"
      });
    }
    const artifactPath = resolve(artifactDirectory, job.artifactPath);
    if (
      !artifactPath.startsWith(`${artifactDirectory}\\`) &&
      !artifactPath.startsWith(`${artifactDirectory}/`)
    ) {
      throw new NotFoundException({
        code: "EXPORT_NOT_AVAILABLE",
        message: "Export artifact is not available"
      });
    }
    let data: Buffer;
    try {
      data = await readFile(artifactPath);
    } catch {
      throw new NotFoundException({
        code: "EXPORT_NOT_AVAILABLE",
        message: "Export artifact is not available"
      });
    }
    if (createHash("sha256").update(data).digest("hex") !== job.checksum) {
      throw new ConflictException({
        code: "EXPORT_CHECKSUM_MISMATCH",
        message: "Export artifact failed integrity verification"
      });
    }
    return { data, fileName: job.fileName, mimeType: job.mimeType };
  }

  private async findVisible(id: string, context: ExportContext) {
    const job = await this.database.client.exportJob.findFirst({
      where: { id, ...this.visibilityWhere(context) }
    });
    if (!job) {
      throw new NotFoundException({
        code: "EXPORT_NOT_FOUND",
        message: "Export job was not found"
      });
    }
    return job;
  }

  private visibilityWhere(context: ExportContext): Prisma.ExportJobWhereInput {
    return context.role === Role.ADMIN || context.role === Role.MANAGER
      ? {}
      : { requesterId: context.actorId };
  }

  private assertReportAccess(
    reportType: ExportReportType,
    role: RoleValue
  ): void {
    if (role === Role.ADMIN || role === Role.MANAGER) return;
    const inventory = reportType.startsWith("INVENTORY_");
    if (role === Role.WAREHOUSE && inventory) return;
    if (role === Role.SALES && !inventory) return;
    throw new ForbiddenException({
      code: "PERMISSION_DENIED",
      message: "This report cannot be exported by the current role"
    });
  }
}

function hashRequest(
  input: CreateExportRequest,
  context: ExportContext
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        actorId: context.actorId,
        role: context.role,
        input
      })
    )
    .digest("hex");
}

function mapJob(job: {
  id: string;
  reportType: ExportReportType;
  format: "XLSX" | "PDF";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "EXPIRED";
  filters: Prisma.JsonValue;
  fileName: string | null;
  mimeType: string | null;
  checksum: string | null;
  sizeBytes: number | null;
  expiresAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ExportJobResponse {
  return {
    id: job.id,
    reportType: job.reportType,
    format: job.format,
    status: job.status,
    filters: job.filters as Record<string, unknown>,
    fileName: job.fileName,
    mimeType: job.mimeType,
    checksum: job.checksum,
    sizeBytes: job.sizeBytes,
    expiresAt: job.expiresAt?.toISOString() ?? null,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}
