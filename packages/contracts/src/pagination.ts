import { z } from "zod";

export function createPaginatedResponseSchema<T extends z.ZodType>(
  itemSchema: T
) {
  return z.object({
    items: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    total: z.number().int().nonnegative()
  });
}
