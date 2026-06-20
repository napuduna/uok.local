import { Injectable, type OnApplicationShutdown } from "@nestjs/common";

import { parseWorkerEnvironment } from "@warehouse/config";
import {
  createDatabaseClient,
  type DatabaseClient
} from "@warehouse/database";

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: DatabaseClient;

  constructor() {
    const environment = parseWorkerEnvironment(process.env);
    this.client = createDatabaseClient(environment.DATABASE_URL);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
