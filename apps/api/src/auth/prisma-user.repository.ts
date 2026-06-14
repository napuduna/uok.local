import { Injectable } from "@nestjs/common";
import type { Prisma } from "@warehouse/database";

import { DatabaseService } from "../database/database.service";
import type {
  AuthUserRecord,
  SessionUserRecord,
  UserRepository
} from "./auth.types";

type UserWithRole = Prisma.UserGetPayload<{
  include: { role: true };
}>;

function mapUser(user: UserWithRole): AuthUserRecord {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    passwordHash: user.passwordHash,
    isActive: user.isActive,
    sessionVersion: user.sessionVersion,
    role: user.role.name
  };
}

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly database: DatabaseService) {}

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = await this.database.client.user.findUnique({
      where: { email },
      include: { role: true }
    });
    return user ? mapUser(user) : null;
  }

  async findSessionUserById(userId: string): Promise<SessionUserRecord | null> {
    const user = await this.database.client.user.findUnique({
      where: { id: userId },
      include: { role: true }
    });
    return user ? mapUser(user) : null;
  }
}
