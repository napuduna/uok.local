import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "./generated/client/client.js";

export type DatabaseClient = PrismaClient;
export type TransactionClient = Prisma.TransactionClient;

export function createDatabaseAdapter(connectionString: string) {
  const databaseUrl = new URL(connectionString);
  const schema = databaseUrl.searchParams.get("schema") ?? undefined;
  databaseUrl.searchParams.delete("schema");
  if (schema && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error("DATABASE_URL schema contains unsupported characters");
  }

  return new PrismaPg(
    {
      connectionString: databaseUrl.toString(),
      ...(schema ? { options: `-c search_path=${schema}` } : {})
    },
    schema ? { schema } : undefined
  );
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
