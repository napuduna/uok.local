import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  GoneException,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  StreamableFile,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import { createExportRequestSchema, Permission } from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../auth/permission.guard";
import { RequireAnyPermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { ExportsService } from "./exports.service";

const idSchema = z.string().uuid();
const idempotencyKeySchema = z.string().trim().min(1).max(200);

@Controller("exports")
@UseGuards(SessionAuthGuard, PermissionGuard)
@RequireAnyPermissions(
  Permission.EXPORT_ALL,
  Permission.EXPORT_OWN,
  Permission.EXPORT_STOCK
)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post()
  @HttpCode(202)
  create(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    const parsedBody = createExportRequestSchema.safeParse(body);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsedBody.success) {
      throw validationError("ข้อมูลคำขอ Export ไม่ถูกต้อง", parsedBody.error);
    }
    if (!parsedKey.success) {
      throw validationError("ต้องระบุ Idempotency-Key", parsedKey.error);
    }
    return this.exportsService.create(parsedBody.data, {
      actorId: request.auth!.id,
      role: request.auth!.role,
      idempotencyKey: parsedKey.data,
      requestId: request.requestId
    });
  }

  @Get(":id")
  get(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.exportsService.get(parseId(id), {
      actorId: request.auth!.id,
      role: request.auth!.role
    });
  }

  @Get(":id/download")
  async download(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest
  ): Promise<StreamableFile> {
    const artifact = await this.exportsService.getDownload(parseId(id), {
      actorId: request.auth!.id,
      role: request.auth!.role
    });
    try {
      await stat(artifact.artifactPath);
    } catch {
      throw new GoneException({
        code: "EXPORT_ARTIFACT_MISSING",
        message: "ไฟล์ Export ไม่พร้อมใช้งานแล้ว"
      });
    }
    return new StreamableFile(createReadStream(artifact.artifactPath), {
      type: artifact.contentType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(
        artifact.fileName
      )}`
    });
  }
}

function parseId(id: string): string {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    throw validationError("รหัสงาน Export ไม่ถูกต้อง", parsed.error);
  }
  return parsed.data;
}

function validationError(message: string, error: z.ZodError) {
  return new BadRequestException({
    code: "VALIDATION_ERROR",
    message,
    details: error.flatten()
  });
}
