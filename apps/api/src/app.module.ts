import {
  type MiddlewareConsumer,
  Module,
  type NestModule
} from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { RedisModule } from "./redis/redis.module";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [DatabaseModule, RedisModule, AuthModule, UsersModule],
  controllers: [HealthController]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
