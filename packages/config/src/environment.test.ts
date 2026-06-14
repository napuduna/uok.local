import { describe, expect, it } from "vitest";

import { parseApiEnvironment, parseWorkerEnvironment } from "./environment";

const baseEnvironment = {
  DATABASE_URL: "postgresql://warehouse:warehouse@localhost:5432/warehouse",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "a-secure-session-secret-with-32-characters"
};

describe("parseApiEnvironment", () => {
  it("applies the documented API defaults", () => {
    const environment = parseApiEnvironment(baseEnvironment);

    expect(environment.NODE_ENV).toBe("development");
    expect(environment.API_PORT).toBe(4000);
  });

  it("rejects missing infrastructure configuration", () => {
    expect(() => parseApiEnvironment({})).toThrow(
      /DATABASE_URL|REDIS_URL|SESSION_SECRET/
    );
  });

  it("rejects a session secret shorter than 32 characters", () => {
    expect(() =>
      parseApiEnvironment({
        ...baseEnvironment,
        SESSION_SECRET: "too-short"
      })
    ).toThrow(/SESSION_SECRET/);
  });
});

describe("parseWorkerEnvironment", () => {
  it("coerces the worker port from a string", () => {
    const environment = parseWorkerEnvironment({
      ...baseEnvironment,
      WORKER_PORT: "4101"
    });

    expect(environment.WORKER_PORT).toBe(4101);
  });
});
