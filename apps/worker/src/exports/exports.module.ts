import { Module } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { ExportArtifactGenerator } from "./export-artifact.generator";
import { ExportProcessorService } from "./export-processor.service";
import { ExportQueueWorker } from "./export-queue.worker";
import { ExportRuntimeConfigService } from "./export-runtime-config.service";

@Module({
  providers: [
    DatabaseService,
    ExportRuntimeConfigService,
    ExportArtifactGenerator,
    ExportProcessorService,
    ExportQueueWorker
  ]
})
export class ExportsModule {}
