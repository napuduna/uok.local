import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { StockInsController } from "./stock-ins.controller";
import { StockInsService } from "./stock-ins.service";

@Module({
  imports: [AuthModule],
  controllers: [StockInsController],
  providers: [StockInsService]
})
export class StockInsModule {}
