import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "./generated/client/client.js";

export type DatabaseClient = PrismaClient;
export type TransactionClient = Prisma.TransactionClient;

export function createDatabaseAdapter(connectionString: string) {
  return new PrismaPg({ connectionString });
}

export function createDatabaseClient(connectionString: string): DatabaseClient {
  return new PrismaClient({
    adapter: createDatabaseAdapter(connectionString)
  });
}

export async function withSerializableTransaction<T>(
  client: DatabaseClient,
  operation: (transaction: TransactionClient) => Promise<T>
): Promise<T> {
  return client.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function lockRowsForUpdate<T>(
  transaction: TransactionClient,
  query: Prisma.Sql
): Promise<T[]> {
  return transaction.$queryRaw<T[]>(Prisma.sql`${query} FOR UPDATE`);
}
