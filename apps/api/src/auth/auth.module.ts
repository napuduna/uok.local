import { Module } from "@nestjs/common";

import { PrismaSecurityEventRecorder } from "../audit/prisma-security-event.recorder";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import {
  LOGIN_ATTEMPT_LIMITER,
  SECURITY_EVENT_RECORDER,
  SESSION_STORE,
  USER_REPOSITORY
} from "./auth.types";
import { PermissionGuard } from "./permission.guard";
import { PrismaUserRepository } from "./prisma-user.repository";
import { RedisLoginAttemptLimiter } from "./redis-login-attempt-limiter";
import { RedisSessionStore } from "./redis-session.store";
import { SessionAuthGuard } from "./session-auth.guard";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionAuthGuard,
    PermissionGuard,
    PrismaUserRepository,
    RedisSessionStore,
    RedisLoginAttemptLimiter,
    PrismaSecurityEventRecorder,
    { provide: USER_REPOSITORY, useExisting: PrismaUserRepository },
    { provide: SESSION_STORE, useExisting: RedisSessionStore },
    {
      provide: LOGIN_ATTEMPT_LIMITER,
      useExisting: RedisLoginAttemptLimiter
    },
    {
      provide: SECURITY_EVENT_RECORDER,
      useExisting: PrismaSecurityEventRecorder
    }
  ],
  exports: [AuthService, SessionAuthGuard, PermissionGuard]
})
export class AuthModule {}
