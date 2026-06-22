import { Module } from "@nestjs/common";

import { ExportCleanupService } from "./export-cleanup.service";
import { ExportWorkerService } from "./export-worker.service";

@Module({
  providers: [ExportCleanupService, ExportWorkerService]
})
export class ExportsModule {}
