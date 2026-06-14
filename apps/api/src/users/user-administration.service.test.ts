import { describe, expect, it, vi } from "vitest";

import { Role } from "@warehouse/contracts";

import type { DatabaseService } from "../database/database.service";
import { UserAdministrationService } from "./user-administration.service";

describe("UserAdministrationService", () => {
  it("changes a role and writes the audit record in one transaction", async () => {
    const targetUser = {
      id: "target-user",
      roleId: "sales-role",
      sessionVersion: 3,
      isActive: true,
      role: { name: Role.SALES }
    };
    const update = vi.fn().mockResolvedValue({
      ...targetUser,
      roleId: "manager-role",
      sessionVersion: 4,
      role: { name: Role.MANAGER }
    });
    const createAudit = vi.fn().mockResolvedValue({});
    const transaction = {
      user: {
        findUnique: vi.fn().mockResolvedValue(targetUser),
        update
      },
      role: {
        findUnique: vi.fn().mockResolvedValue({
          id: "manager-role",
          name: Role.MANAGER
        })
      },
      auditLog: { create: createAudit }
    };
    const database = {
      client: {
        $transaction: vi
          .fn()
          .mockImplementation(
            (operation: (value: typeof transaction) => unknown) =>
              Promise.resolve(operation(transaction))
          )
      }
    } as unknown as DatabaseService;
    const service = new UserAdministrationService(database);

    await service.changeRole({
      targetUserId: "target-user",
      role: Role.MANAGER,
      actorId: "admin-user",
      requestId: "request-1"
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "target-user" },
      data: {
        roleId: "manager-role",
        sessionVersion: { increment: 1 }
      },
      include: { role: true }
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: "admin-user",
        action: "USER_ROLE_CHANGED",
        resourceType: "USER",
        resourceId: "target-user",
        requestId: "request-1",
        before: { role: Role.SALES, sessionVersion: 3 },
        after: { role: Role.MANAGER, sessionVersion: 4 }
      })
    });
  });

  it("deactivates without deleting and revokes existing sessions", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "target-user",
      isActive: false,
      sessionVersion: 2,
      deactivatedAt: new Date("2026-06-14T09:00:00.000Z")
    });
    const createAudit = vi.fn().mockResolvedValue({});
    const transaction = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "target-user",
          isActive: true,
          sessionVersion: 1
        }),
        update
      },
      auditLog: { create: createAudit }
    };
    const database = {
      client: {
        $transaction: vi
          .fn()
          .mockImplementation(
            (operation: (value: typeof transaction) => unknown) =>
              Promise.resolve(operation(transaction))
          )
      }
    } as unknown as DatabaseService;
    const service = new UserAdministrationService(database);

    await service.deactivate({
      targetUserId: "target-user",
      actorId: "admin-user",
      requestId: "request-2"
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "target-user" },
      data: {
        isActive: false,
        deactivatedAt: expect.any(Date),
        sessionVersion: { increment: 1 }
      }
    });
    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "USER_DEACTIVATED",
        before: { isActive: true, sessionVersion: 1 },
        after: { isActive: false, sessionVersion: 2 }
      })
    });
  });
});
