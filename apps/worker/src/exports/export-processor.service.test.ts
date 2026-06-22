import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExportProcessorService } from "./export-processor.service";

function exportRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    reportType: "SALES",
    format: "XLSX",
    status: "PENDING",
    requestedById: "00000000-0000-4000-8000-000000000002",
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
    artifactPath: null,
    expiresAt: new Date("2026-06-21T00:00:00.000Z"),
    ...overrides
  };
}

function createHarness(record = exportRecord()) {
  const applyUpdate = ({ data }: { data: Record<string, unknown> }) => ({
    ...record,
    ...data
  });
  const transaction = {
    exportJob: {
      update: vi.fn().mockImplementation(applyUpdate)
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({})
    }
  };
  const database = {
    client: {
      exportJob: {
        findUnique: vi.fn().mockResolvedValue(record),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockImplementation(applyUpdate)
      },
      $transaction: vi
        .fn()
        .mockImplementation(
          (callback: (client: typeof transaction) => unknown) =>
            callback(transaction)
        )
    }
  };
  const generator = {
    generate: vi.fn().mockResolvedValue({
      artifactPath: "C:/exports/sales.xlsx",
      fileName: "sales.xlsx",
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileChecksum: "a".repeat(64),
      fileSizeBytes: 2048
    })
  };
  const service = new ExportProcessorService(
    database as never,
    generator as never,
    {
      artifactDirectory: "C:/exports",
      thaiFontPath: "C:/fonts/thai.woff2",
      redisUrl: "redis://localhost:6379"
    }
  );
  return { service, database, generator, transaction, record };
}

describe("ExportProcessorService", () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "uok-cleanup-"));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("does not generate a second artifact for a completed retry", async () => {
    const completed = exportRecord({ status: "COMPLETED" });
    const { service, generator, transaction } = createHarness(completed);

    await service.process(completed.id);

    expect(generator.generate).not.toHaveBeenCalled();
    expect(transaction.exportJob.update).not.toHaveBeenCalled();
  });

  it("persists one completed artifact with checksum metadata", async () => {
    const { service, generator, transaction, record } = createHarness();

    await service.process(record.id);

    expect(generator.generate).toHaveBeenCalledWith({
      exportJobId: record.id,
      reportType: record.reportType,
      format: record.format,
      snapshot: record.resultSnapshot,
      outputDirectory: "C:/exports",
      thaiFontPath: "C:/fonts/thai.woff2"
    });
    expect(transaction.exportJob.update).toHaveBeenLastCalledWith({
      where: { id: record.id },
      data: expect.objectContaining({
        status: "COMPLETED",
        fileChecksum: "a".repeat(64),
        fileSizeBytes: 2048,
        safeErrorCode: null,
        safeErrorMessage: null
      })
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "EXPORT_COMPLETED",
        resourceId: record.id
      })
    });
  });

  it("persists a safe failure and throws a retryable generic error", async () => {
    const { service, generator, transaction, record } = createHarness();
    generator.generate.mockRejectedValue(new Error("secret filesystem detail"));

    await expect(service.process(record.id)).rejects.toThrow(
      "Export generation failed"
    );
    expect(transaction.exportJob.update).toHaveBeenLastCalledWith({
      where: { id: record.id },
      data: expect.objectContaining({
        status: "FAILED",
        safeErrorCode: "EXPORT_GENERATION_FAILED"
      })
    });
    expect(
      transaction.exportJob.update.mock.calls.at(-1)?.[0].data.safeErrorMessage
    ).not.toContain("secret");
  });

  it("removes expired artifacts and retains auditable metadata", async () => {
    const artifactPath = join(temporaryDirectory, "expired.xlsx");
    await writeFile(artifactPath, "artifact");
    const expired = exportRecord({
      status: "COMPLETED",
      artifactPath,
      fileChecksum: "b".repeat(64)
    });
    const { service, database, transaction } = createHarness(expired);
    database.client.exportJob.findMany.mockResolvedValue([expired]);

    const count = await service.cleanupExpired(
      new Date("2026-06-22T00:00:00.000Z")
    );

    expect(count).toBe(1);
    expect(transaction.exportJob.update).toHaveBeenLastCalledWith({
      where: { id: expired.id },
      data: {
        status: "EXPIRED",
        artifactPath: null,
        expiredAt: new Date("2026-06-22T00:00:00.000Z")
      }
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "EXPORT_EXPIRED",
        resourceId: expired.id,
        metadata: {
          fileChecksum: "b".repeat(64)
        }
      })
    });
  });
});
