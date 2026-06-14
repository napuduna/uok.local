import { BadRequestException, HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { ApiExceptionFilter } from "./api-exception.filter";
import { RequestIdMiddleware } from "./request-id.middleware";

describe("RequestIdMiddleware", () => {
  it("propagates a safe incoming request ID", () => {
    const middleware = new RequestIdMiddleware();
    const request = {
      headers: { "x-request-id": "client-request-123" }
    } as never;
    const setHeader = vi.fn();
    const response = { setHeader } as never;
    const next = vi.fn();

    middleware.use(request, response, next);

    expect(request).toMatchObject({ requestId: "client-request-123" });
    expect(setHeader).toHaveBeenCalledWith(
      "x-request-id",
      "client-request-123"
    );
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("ApiExceptionFilter", () => {
  it("maps expected errors to the standard envelope", () => {
    const filter = new ApiExceptionFilter();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: "request-123" }),
        getResponse: () => ({ status, json })
      })
    } as never;

    filter.catch(
      new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "ข้อมูลไม่ถูกต้อง",
        details: { field: "email" }
      }),
      host
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      code: "VALIDATION_ERROR",
      message: "ข้อมูลไม่ถูกต้อง",
      details: { field: "email" },
      requestId: "request-123"
    });
  });
});
