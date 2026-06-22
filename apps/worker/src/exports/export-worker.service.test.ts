import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExportSnapshot } from "@warehouse/contracts";

import type { DatabaseService } from "../database/database.service";
import { ExportWorkerService } from "./export-worker.service";

const snapshot: ExportSnapshot = {
  reportType: "SALES",
  title: "Sales report",
  generatedAt: "2026-06-21T00:00:00.000Z",
  filters: {
    dateFrom: "2026-06-01",
    dateTo: "2026-06-21",
    groupBy: "day"
  },
  columns: [
    { key: "period", label: "Period", width: 18 },
    { key: "totalSales", label: "Total sales", width: 18 }
  ],
  rows: [{ period: "2026-06-21", totalSales: "100.00" }],
  totals: { totalSales: "100.00" }
};

describe("ExportWorkerService", () => {
  const originalArtifactDirectory = process.env.EXPORT_ARTIFACT_DIR;

  afterEach(() => {
    process.env.EXPORT_ARTIFACT_DIR = originalArtifactDirectory;
    vi.restoreAllMocks();
  });

  it("does not create a second artifact or audit on a completed retry", async () => {
    const artifactDirectory = await mkdtemp(
      join(tmpdir(), "warehouse-worker-export-")
    );
    process.env.EXPORT_ARTIFACT_DIR = artifactDirectory;
    const audits: unknown[] = [];
    const job = {
      id: "00000000-0000-4000-8000-000000000001",
      reportType: "SALES" as const,
      format: "XLSX" as const,
      status: "PENDING" as
        | "PENDING"
        | "PROCESSING"
        | "COMPLETED"
        | "FAILED"
        | "EXPIRED",
      requesterId: "00000000-0000-4000-8000-000000000002",
      snapshot,
      artifactPath: null as string | null
    };
    const update = vi.fn(({ data }: { data: Record<string, unknown> }) => {
      Object.assign(job, data);
      return job;
    });
    const transaction = {
      exportJob: { update },
      auditLog: {
        create: vi.fn(({ data }: { data: unknown }) => {
          audits.push(data);
          return data;
        })
      }
    };
    const client = {
      exportJob: {
        findUnique: vi.fn(() => job),
        update
      },
      $transaction: vi.fn(
        async (callback: (value: typeof transaction) => Promise<unknown>) =>
          callback(transaction)
      )
    };
    const service = new ExportWorkerService({
      client
    } as unknown as DatabaseService);

    try {
      await service.processExport(job.id);
      await service.processExport(job.id);

      const artifacts = await readdir(artifactDirectory);
      expect(job.status).toBe("COMPLETED");
      expect(artifacts.filter((file) => file.endsWith(".xlsx"))).toHaveLength(
        1
      );
      expect(audits).toHaveLength(1);
    } finally {
      await rm(artifactDirectory, { recursive: true, force: true });
    }
  });
});
