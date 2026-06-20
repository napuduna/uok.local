import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { CreateExportRequest } from "@warehouse/contracts";

import { ExportsService } from "./exports.service";

const salesRequest: CreateExportRequest = {
  reportType: "SALES",
  format: "XLSX",
  filters: {
    dateFrom: "2026-02-01",
    dateTo: "2026-02-28",
    groupBy: "month"
  }
};

function exportRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    reportType: "SALES",
    format: "XLSX",
    status: "PENDING",
    requestedById: "00000000-0000-4000-8000-000000000002",
    requestedRole: "SALES",
    filters: salesRequest.filters,
    resultSnapshot: {
      items: [],
      page: 1,
      pageSize: 100,
      total: 0,
      totals: {
        invoiceCount: 0,
        quantitySold: 0,
        totalSales: "0.00"
      }
    },
    idempotencyKey: "export-key",
    requestHash: "",
    requestId: "request-1",
    fileName: null,
    contentType: null,
    artifactPath: null,
    fileChecksum: null,
    fileSizeBytes: null,
    safeErrorCode: null,
    safeErrorMessage: null,
    expiresAt: new Date("2026-06-21T00:00:00.000Z"),
    completedAt: null,
    failedAt: null,
    expiredAt: null,
    createdAt: new Date("2026-06-20T00:00:00.000Z"),
    updatedAt: new Date("2026-06-20T00:00:00.000Z"),
    ...overrides
  };
}

function createHarness(existing: ReturnType<typeof exportRecord> | null = null) {
  const created = exportRecord();
  const transaction = {
    exportJob: {
      create: vi.fn().mockResolvedValue(created),
      update: vi.fn()
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({})
    }
  };
  const database = {
    client: {
      exportJob: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn()
      },
      $transaction: vi
        .fn()
        .mockImplementation(
          (callback: (client: typeof transaction) => unknown) =>
            callback(transaction)
        )
    }
  };
  const reports = {
    exportSnapshot: vi.fn().mockResolvedValue(created.resultSnapshot)
  };
  const queue = {
    enqueue: vi.fn().mockResolvedValue(undefined)
  };
  const service = new ExportsService(
    database as never,
    reports as never,
    queue as never
  );

  return { service, database, reports, queue, transaction, created };
}

describe("ExportsService", () => {
  it("creates one auditable export and enqueues its database id", async () => {
    const { service, reports, queue, transaction, created } = createHarness();

    const result = await service.create(salesRequest, {
      actorId: created.requestedById,
      role: "SALES",
      idempotencyKey: "export-key",
      requestId: "request-1",
      now: new Date("2026-06-20T00:00:00.000Z")
    });

    expect(reports.exportSnapshot).toHaveBeenCalledWith(
      "SALES",
      salesRequest.filters,
      {
        actorId: created.requestedById,
        role: "SALES"
      }
    );
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: created.requestedById,
        action: "EXPORT_REQUESTED",
        resourceType: "EXPORT_JOB",
        resourceId: created.id
      })
    });
    expect(queue.enqueue).toHaveBeenCalledWith(created.id);
    expect(result.id).toBe(created.id);
  });

  it("rejects report categories outside the export role scope", async () => {
    const { service } = createHarness();

    await expect(
      service.create(
        {
          reportType: "INVENTORY_CURRENT",
          format: "PDF",
          filters: {}
        },
        {
          actorId: "00000000-0000-4000-8000-000000000002",
          role: "SALES",
          idempotencyKey: "sales-stock",
          now: new Date("2026-06-20T00:00:00.000Z")
        }
      )
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.create(salesRequest, {
        actorId: "00000000-0000-4000-8000-000000000003",
        role: "WAREHOUSE",
        idempotencyKey: "warehouse-sales",
        now: new Date("2026-06-20T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns the original job for an identical idempotent request", async () => {
    const { service, queue, reports, created } = createHarness();
    const requestHash = service.requestHash(salesRequest);
    const existing = exportRecord({ requestHash });
    const harness = createHarness(existing);

    const result = await harness.service.create(salesRequest, {
      actorId: existing.requestedById,
      role: "SALES",
      idempotencyKey: existing.idempotencyKey,
      now: new Date("2026-06-20T00:00:00.000Z")
    });

    expect(result.id).toBe(existing.id);
    expect(harness.reports.exportSnapshot).not.toHaveBeenCalled();
    expect(harness.queue.enqueue).not.toHaveBeenCalled();
    expect(queue).toBeDefined();
    expect(reports).toBeDefined();
    expect(created).toBeDefined();
  });

  it("rejects reuse of an idempotency key for different export input", async () => {
    const existing = exportRecord({ requestHash: "different" });
    const { service } = createHarness(existing);

    await expect(
      service.create(salesRequest, {
        actorId: existing.requestedById,
        role: "SALES",
        idempotencyKey: existing.idempotencyKey,
        now: new Date("2026-06-20T00:00:00.000Z")
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("restricts artifact access to the requester or an all-export role", async () => {
    const completed = exportRecord({
      status: "COMPLETED",
      artifactPath: "C:/tmp/export.xlsx",
      fileName: "export.xlsx",
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const { service } = createHarness(completed);

    await expect(
      service.getDownload(completed.id, {
        actorId: "00000000-0000-4000-8000-000000000099",
        role: "SALES"
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.getDownload(completed.id, {
        actorId: "00000000-0000-4000-8000-000000000099",
        role: "MANAGER"
      })
    ).resolves.toMatchObject({
      artifactPath: completed.artifactPath,
      fileName: completed.fileName,
      contentType: completed.contentType
    });
  });
  it("records a safe auditable failure when Redis enqueue fails", async () => {
    const { service, queue, transaction, created } = createHarness();
    queue.enqueue.mockRejectedValue(new Error("redis secret detail"));
    transaction.exportJob.update.mockResolvedValue({
      ...created,
      status: "FAILED",
      safeErrorCode: "EXPORT_QUEUE_UNAVAILABLE",
      safeErrorMessage: "??????????????? Export ??????????"
    });

    const result = await service.create(salesRequest, {
      actorId: created.requestedById,
      role: "SALES",
      idempotencyKey: "queue-failure",
      requestId: "request-queue-failure",
      now: new Date("2026-06-20T00:00:00.000Z")
    });

    expect(result.status).toBe("FAILED");
    expect(result.safeError).toEqual({
      code: "EXPORT_QUEUE_UNAVAILABLE",
      message: expect.any(String)
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "EXPORT_FAILED",
        resourceId: created.id,
        metadata: {
          errorCode: "EXPORT_QUEUE_UNAVAILABLE"
        }
      })
    });
  });
  it("resolves a concurrent idempotency unique conflict to the winning job", async () => {
    const { service, database, reports, queue, created } = createHarness();
    const winner = exportRecord({
      requestHash: service.requestHash(salesRequest)
    });
    database.client.exportJob.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    database.client.$transaction.mockRejectedValueOnce({ code: "P2002" });

    const result = await service.create(salesRequest, {
      actorId: winner.requestedById,
      role: "SALES",
      idempotencyKey: winner.idempotencyKey,
      now: new Date("2026-06-20T00:00:00.000Z")
    });

    expect(result.id).toBe(winner.id);
    expect(reports.exportSnapshot).toHaveBeenCalledOnce();
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(created).toBeDefined();
  });
});
