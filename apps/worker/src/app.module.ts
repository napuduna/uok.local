import {
  type MiddlewareConsumer,
  Module,
  type NestModule
} from "@nestjs/common";

import { RequestIdMiddleware } from "./common/request-id.middleware";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";

@Module({
  controllers: [HealthController],
  providers: [HealthService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
