import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";

import {
  createExportRequestSchema,
  exportListQuerySchema,
  Permission
} from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../auth/permission.guard";
import { RequireAnyPermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ExportsService } from "./exports.service";

function parseOrThrow<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException({
      code: "VALIDATION_ERROR",
      message,
      details: parsed.error.flatten()
    });
  }
  return parsed.data;
}

function exportContext(request: AuthenticatedRequest) {
  return {
    actorId: request.auth!.id,
    role: request.auth!.role
  };
}

const exportPermissions = [
  Permission.EXPORT_ALL,
  Permission.EXPORT_OWN,
  Permission.EXPORT_STOCK
] as const;

@Controller("exports")
@UseGuards(SessionAuthGuard, PermissionGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  @RequireAnyPermissions(...exportPermissions)
  create(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "Idempotency-Key header is required"
      });
    }
    return this.exportsService.create(
      parseOrThrow(createExportRequestSchema, body, "Invalid export request"),
      idempotencyKey.trim(),
      exportContext(request)
    );
  }

  @Get()
  @RequireAnyPermissions(...exportPermissions)
  list(
    @Query() query: Record<string, unknown>,
    @Req() request: AuthenticatedRequest
  ) {
    return this.exportsService.list(
      parseOrThrow(exportListQuerySchema, query, "Invalid export filters"),
      exportContext(request)
    );
  }

  @Get(":id")
  @RequireAnyPermissions(...exportPermissions)
  get(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.exportsService.get(id, exportContext(request));
  }

  @Get(":id/download")
  @RequireAnyPermissions(...exportPermissions)
  async download(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<StreamableFile> {
    const artifact = await this.exportsService.download(
      id,
      exportContext(request)
    );
    response.setHeader("content-type", artifact.mimeType);
    response.setHeader(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`
    );
    response.setHeader("content-length", artifact.data.byteLength.toString());
    return new StreamableFile(artifact.data);
  }
}
