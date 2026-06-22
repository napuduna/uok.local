import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ReportsModule } from "../reports/reports.module";
import { ExportQueueService } from "./export-queue.service";
import { ExportSnapshotService } from "./export-snapshot.service";
import { ExportsController } from "./exports.controller";
import { ExportsService } from "./exports.service";

@Module({
  imports: [AuthModule, ReportsModule],
  controllers: [ExportsController],
  providers: [ExportQueueService, ExportSnapshotService, ExportsService]
})
export class ExportsModule {}
