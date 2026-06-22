import { Injectable, OnModuleDestroy } from "@nestjs/common";

import { createDatabaseClient, type DatabaseClient } from "@warehouse/database";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: DatabaseClient = createDatabaseClient(
    process.env.DATABASE_URL ??
      "postgresql://warehouse:warehouse@postgres:5432/warehouse"
  );

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
