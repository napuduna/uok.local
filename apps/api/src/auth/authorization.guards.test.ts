import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { Permission, Role } from "@warehouse/contracts";

import type { AuthService } from "./auth.service";
import { PermissionGuard } from "./permission.guard";
import { SessionAuthGuard } from "./session-auth.guard";

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getClass: vi.fn(),
    getHandler: vi.fn(),
    getArgs: vi.fn(),
    getArgByIndex: vi.fn(),
    switchToRpc: vi.fn(),
    switchToWs: vi.fn(),
    getType: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: vi.fn(),
      getNext: vi.fn()
    })
  } as unknown as ExecutionContext;
}

describe("SessionAuthGuard", () => {
  it("loads the opaque session cookie and attaches the authenticated user", async () => {
    const authenticatedUser = {
      id: "346a5fe3-4b31-4c89-ac39-37a2d13cf14d",
      email: "admin@uok.local",
      name: "ผู้ดูแลระบบ",
      role: Role.ADMIN
    };
    const authenticate = vi.fn().mockResolvedValue(authenticatedUser);
    const authService = {
      authenticate
    } as unknown as AuthService;
    const guard = new SessionAuthGuard(authService);
    const request: Record<string, unknown> = {
      headers: {
        cookie: "theme=dark; warehouse_session=opaque-token; locale=th"
      }
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith("opaque-token");
    expect(request.auth).toEqual(authenticatedUser);
  });
});

describe("PermissionGuard", () => {
  it("denies a role without the required capability", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Permission.STOCK_MANAGE])
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = createContext({
      auth: {
        id: "user-1",
        email: "sales@uok.local",
        name: "ฝ่ายขาย",
        role: Role.SALES
      }
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("allows an Admin for every protected capability", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([Permission.BACKUP_MANAGE])
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const context = createContext({
      auth: {
        id: "user-1",
        email: "admin@uok.local",
        name: "ผู้ดูแลระบบ",
        role: Role.ADMIN
      }
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
