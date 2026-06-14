import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, type TransactionClient } from "@warehouse/database";

import type { RoleValue } from "@warehouse/contracts";

import { DatabaseService } from "../database/database.service";

interface ChangeRoleCommand {
  targetUserId: string;
  role: RoleValue;
  actorId: string;
  requestId?: string | undefined;
}

interface DeactivateUserCommand {
  targetUserId: string;
  actorId: string;
  requestId?: string | undefined;
}

@Injectable()
export class UserAdministrationService {
  constructor(private readonly database: DatabaseService) {}

  async list() {
    return this.database.client.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        deactivatedAt: true,
        role: { select: { name: true } }
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }]
    });
  }

  async changeRole(command: ChangeRoleCommand) {
    return this.database.client.$transaction(
      async (transaction) => this.changeRoleInTransaction(transaction, command),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  async deactivate(command: DeactivateUserCommand) {
    return this.database.client.$transaction(
      async (transaction) => this.deactivateInTransaction(transaction, command),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  private async changeRoleInTransaction(
    transaction: TransactionClient,
    command: ChangeRoleCommand
  ) {
    const [target, role] = await Promise.all([
      transaction.user.findUnique({
        where: { id: command.targetUserId },
        include: { role: true }
      }),
      transaction.role.findUnique({ where: { name: command.role } })
    ]);

    if (!target) {
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "ไม่พบผู้ใช้"
      });
    }
    if (!role) {
      throw new NotFoundException({
        code: "ROLE_NOT_FOUND",
        message: "ไม่พบบทบาทผู้ใช้"
      });
    }

    const updated = await transaction.user.update({
      where: { id: command.targetUserId },
      data: {
        roleId: role.id,
        sessionVersion: { increment: 1 }
      },
      include: { role: true }
    });

    await transaction.auditLog.create({
      data: {
        actorId: command.actorId,
        action: "USER_ROLE_CHANGED",
        resourceType: "USER",
        resourceId: target.id,
        ...(command.requestId ? { requestId: command.requestId } : {}),
        before: {
          role: target.role.name,
          sessionVersion: target.sessionVersion
        },
        after: {
          role: updated.role.name,
          sessionVersion: updated.sessionVersion
        }
      }
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role.name,
      isActive: updated.isActive
    };
  }

  private async deactivateInTransaction(
    transaction: TransactionClient,
    command: DeactivateUserCommand
  ) {
    const target = await transaction.user.findUnique({
      where: { id: command.targetUserId }
    });

    if (!target) {
      throw new NotFoundException({
        code: "USER_NOT_FOUND",
        message: "ไม่พบผู้ใช้"
      });
    }
    if (!target.isActive) {
      throw new ConflictException({
        code: "USER_ALREADY_INACTIVE",
        message: "บัญชีผู้ใช้นี้ถูกปิดใช้งานแล้ว"
      });
    }

    const updated = await transaction.user.update({
      where: { id: command.targetUserId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        sessionVersion: { increment: 1 }
      }
    });

    await transaction.auditLog.create({
      data: {
        actorId: command.actorId,
        action: "USER_DEACTIVATED",
        resourceType: "USER",
        resourceId: target.id,
        ...(command.requestId ? { requestId: command.requestId } : {}),
        before: {
          isActive: target.isActive,
          sessionVersion: target.sessionVersion
        },
        after: {
          isActive: updated.isActive,
          sessionVersion: updated.sessionVersion
        }
      }
    });

    return {
      id: updated.id,
      isActive: updated.isActive,
      deactivatedAt: updated.deactivatedAt
    };
  }
}
