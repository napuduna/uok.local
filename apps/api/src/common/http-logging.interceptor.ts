import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor
} from "@nestjs/common";
import type { Response } from "express";
import { tap } from "rxjs";

import type { AuthenticatedRequest } from "../auth/authenticated-request";

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const startedAt = performance.now();
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap({
        finalize: () => {
          process.stdout.write(
            `${JSON.stringify({
              timestamp: new Date().toISOString(),
              level: "info",
              event: "http_request",
              requestId: request.requestId ?? null,
              method: request.method,
              path: request.originalUrl,
              statusCode: response.statusCode,
              durationMs: Math.round(performance.now() - startedAt),
              actorId: request.auth?.id ?? null
            })}\n`
          );
        }
      })
    );
  }
}
