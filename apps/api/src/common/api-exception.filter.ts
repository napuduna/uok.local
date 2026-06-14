import { randomUUID } from "node:crypto";

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import type { Response } from "express";

import type { ApiErrorResponse } from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";

interface ExpectedErrorBody {
  code?: unknown;
  message?: unknown;
  details?: unknown;
}

function isExpectedErrorBody(value: unknown): value is ExpectedErrorBody {
  return typeof value === "object" && value !== null;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const isInternalError = status === 500;
    const exceptionResponse = isHttpException
      ? exception.getResponse()
      : undefined;
    const body = isExpectedErrorBody(exceptionResponse)
      ? exceptionResponse
      : {};

    const payload: ApiErrorResponse = {
      code:
        typeof body.code === "string"
          ? body.code
          : isInternalError
            ? "INTERNAL_ERROR"
            : `HTTP_${status}`,
      message:
        typeof body.message === "string"
          ? body.message
          : isInternalError
            ? "เกิดข้อผิดพลาดภายในระบบ"
            : "ไม่สามารถดำเนินการได้",
      details: body.details ?? null,
      requestId: request.requestId ?? randomUUID()
    };

    if (!isHttpException) {
      process.stderr.write(
        `${JSON.stringify({
          level: "error",
          event: "unhandled_exception",
          requestId: payload.requestId,
          error:
            exception instanceof Error
              ? { name: exception.name, message: exception.message }
              : { name: "UnknownError" }
        })}\n`
      );
    }

    response.status(status).json(payload);
  }
}
