import { Injectable } from "@nestjs/common";
import type { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";
import type { SecurityEvent, SecurityEventRecorder } from "../auth/auth.types";

@Injectable()
export class PrismaSecurityEventRecorder implements SecurityEventRecorder {
  constructor(private readonly database: DatabaseService) {}

  async record(event: SecurityEvent): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      action: event.action,
      resourceType: "AUTH",
      metadata: {
        email: event.email ?? null,
        ipAddress: event.ipAddress ?? null,
        ...event.metadata
      },
      ...(event.actorId ? { actorId: event.actorId } : {}),
      ...(event.requestId ? { requestId: event.requestId } : {})
    };

    await this.database.client.auditLog.create({
      data
    });
  }
}
