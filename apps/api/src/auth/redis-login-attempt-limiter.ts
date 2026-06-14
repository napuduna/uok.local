import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { RedisService } from "../redis/redis.service";
import type { LoginAttemptLimiter, LoginAttemptResult } from "./auth.types";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 5 * 60;

const consumeScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return {count, ttl}
`;

@Injectable()
export class RedisLoginAttemptLimiter implements LoginAttemptLimiter {
  constructor(private readonly redis: RedisService) {}

  async consume(key: string): Promise<LoginAttemptResult> {
    const result = await this.redis.client.eval(
      consumeScript,
      1,
      this.key(key),
      WINDOW_SECONDS
    );
    const [count, ttl] = result as [number, number];

    return {
      allowed: count <= MAX_ATTEMPTS,
      retryAfterSeconds: count <= MAX_ATTEMPTS ? 0 : Math.max(ttl, 1)
    };
  }

  async reset(key: string): Promise<void> {
    await this.redis.client.del(this.key(key));
  }

  private key(value: string): string {
    const hash = createHash("sha256").update(value).digest("hex");
    return `auth:login-attempts:${hash}`;
  }
}
