import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";

import { changeUserRoleRequestSchema, Permission } from "@warehouse/contracts";

import type { AuthenticatedRequest } from "../auth/authenticated-request";
import { PermissionGuard } from "../auth/permission.guard";
import { RequirePermissions } from "../auth/require-permission.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { UserAdministrationService } from "./user-administration.service";

const userIdSchema = z.string().uuid();

@Controller("users")
@UseGuards(SessionAuthGuard, PermissionGuard)
@RequirePermissions(Permission.USER_MANAGE)
export class UsersController {
  constructor(private readonly users: UserAdministrationService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Patch(":id/role")
  changeRole(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest
  ) {
    const targetUserId = this.parseUserId(id);
    const parsed = changeUserRoleRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "บทบาทผู้ใช้ไม่ถูกต้อง",
        details: parsed.error.flatten()
      });
    }

    return this.users.changeRole({
      targetUserId,
      role: parsed.data.role,
      actorId: request.auth!.id,
      requestId: request.requestId
    });
  }

  @Patch(":id/deactivate")
  deactivate(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.users.deactivate({
      targetUserId: this.parseUserId(id),
      actorId: request.auth!.id,
      requestId: request.requestId
    });
  }

  private parseUserId(value: string): string {
    const parsed = userIdSchema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "รหัสผู้ใช้ไม่ถูกต้อง",
        details: parsed.error.flatten()
      });
    }
    return parsed.data;
  }
}
