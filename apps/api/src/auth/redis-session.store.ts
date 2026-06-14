import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { Role } from "@warehouse/contracts";

import { RedisService } from "../redis/redis.service";
import type { AuthSession, SessionStore } from "./auth.types";

const authSessionSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum([Role.ADMIN, Role.MANAGER, Role.SALES, Role.WAREHOUSE]),
  sessionVersion: z.number().int().positive(),
  expiresAt: z.string().datetime({ offset: true })
});

@Injectable()
export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: RedisService) {}

  async create(
    tokenHash: string,
    session: AuthSession,
    ttlSeconds: number
  ): Promise<void> {
    await this.redis.client.set(
      this.key(tokenHash),
      JSON.stringify(session),
      "EX",
      ttlSeconds
    );
  }

  async get(tokenHash: string): Promise<AuthSession | null> {
    const key = this.key(tokenHash);
    const serialized = await this.redis.client.get(key);

    if (!serialized) {
      return null;
    }

    const parsed = authSessionSchema.safeParse(JSON.parse(serialized));
    if (!parsed.success) {
      await this.redis.client.del(key);
      return null;
    }

    return parsed.data;
  }

  async delete(tokenHash: string): Promise<void> {
    await this.redis.client.del(this.key(tokenHash));
  }

  private key(tokenHash: string): string {
    return `session:${tokenHash}`;
  }
}
