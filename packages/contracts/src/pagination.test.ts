import { describe, expect, it } from "vitest";

import { createPaginatedResponseSchema } from "./pagination";
import { z } from "zod";

describe("createPaginatedResponseSchema", () => {
  it("requires integer pagination metadata", () => {
    const schema = createPaginatedResponseSchema(
      z.object({ id: z.string().uuid() })
    );

    expect(
      schema.parse({
        items: [{ id: "019742a1-2db0-7a33-a970-31f5988c66ad" }],
        page: 1,
        pageSize: 25,
        total: 1
      }).total
    ).toBe(1);

    expect(() =>
      schema.parse({
        items: [],
        page: 1.5,
        pageSize: 25,
        total: 0
      })
    ).toThrow();
  });
});
