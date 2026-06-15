import {
  type MiddlewareConsumer,
  Module,
  type NestModule
} from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { AdjustmentsModule } from "./adjustments/adjustments.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { RedisModule } from "./redis/redis.module";
import { StockInsModule } from "./stock-ins/stock-ins.module";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { InventoryModule } from "./inventory/inventory.module";
import { ProductsModule } from "./products/products.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    InventoryModule,
    StockInsModule,
    AdjustmentsModule,
    DashboardModule
  ],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
