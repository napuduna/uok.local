import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { parseApiEnvironment } from "@warehouse/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnApplicationShutdown {
  readonly client: Redis;

  constructor() {
    const environment = parseApiEnvironment(process.env);
    this.client = new Redis(environment.REDIS_URL, {
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 2
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.status !== "end") {
      await this.client.quit();
    }
  }
}
