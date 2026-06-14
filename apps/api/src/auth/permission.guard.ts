import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { hasPermission, type PermissionValue } from "@warehouse/contracts";

import type { AuthenticatedRequest } from "./authenticated-request";
import { REQUIRED_PERMISSIONS_KEY } from "./require-permission.decorator";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<PermissionValue[]>(
        REQUIRED_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()]
      ) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.auth) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "กรุณาเข้าสู่ระบบ"
      });
    }

    const allowed = requiredPermissions.every((permission) =>
      hasPermission(request.auth!.role, permission)
    );

    if (!allowed) {
      throw new ForbiddenException({
        code: "PERMISSION_DENIED",
        message: "คุณไม่มีสิทธิ์ดำเนินการนี้"
      });
    }

    return true;
  }
}
