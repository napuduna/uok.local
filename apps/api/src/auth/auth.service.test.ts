import bcrypt from "bcrypt";
import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { Role } from "@warehouse/contracts";

import { AuthService } from "./auth.service";
import type {
  AuthSession,
  AuthUserRecord,
  LoginAttemptLimiter,
  SecurityEventRecorder,
  SessionStore,
  UserRepository
} from "./auth.types";

const user: AuthUserRecord = {
  id: "346a5fe3-4b31-4c89-ac39-37a2d13cf14d",
  email: "admin@uok.local",
  name: "ผู้ดูแลระบบ",
  passwordHash: "",
  isActive: true,
  sessionVersion: 1,
  role: Role.ADMIN
};

function createDependencies(overrides?: {
  foundUser?: AuthUserRecord | null;
  session?: AuthSession | null;
  allowed?: boolean;
}) {
  const userRepository: UserRepository = {
    findByEmail: vi.fn().mockResolvedValue(overrides?.foundUser ?? user),
    findSessionUserById: vi.fn().mockResolvedValue(overrides?.foundUser ?? user)
  };
  const sessionStore: SessionStore = {
    create: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(overrides?.session ?? null),
    delete: vi.fn().mockResolvedValue(undefined)
  };
  const loginAttemptLimiter: LoginAttemptLimiter = {
    consume: vi.fn().mockResolvedValue({
      allowed: overrides?.allowed ?? true,
      retryAfterSeconds: overrides?.allowed === false ? 60 : 0
    }),
    reset: vi.fn().mockResolvedValue(undefined)
  };
  const securityEvents: SecurityEventRecorder = {
    record: vi.fn().mockResolvedValue(undefined)
  };

  return {
    userRepository,
    sessionStore,
    loginAttemptLimiter,
    securityEvents
  };
}

describe("AuthService", () => {
  it("creates an opaque Redis session after valid credentials", async () => {
    const passwordHash = await bcrypt.hash("CorrectHorse123!", 4);
    const dependencies = createDependencies({
      foundUser: { ...user, passwordHash }
    });
    const service = new AuthService(
      dependencies.userRepository,
      dependencies.sessionStore,
      dependencies.loginAttemptLimiter,
      dependencies.securityEvents
    );

    const result = await service.login(
      { email: " ADMIN@UOK.LOCAL ", password: "CorrectHorse123!" },
      { ipAddress: "127.0.0.1", requestId: "request-1" }
    );

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(result.user).toEqual({
      id: user.id,
      email: user.email,
      name: user.name,
      role: Role.ADMIN
    });
    expect(dependencies.userRepository.findByEmail).toHaveBeenCalledWith(
      "admin@uok.local"
    );
    expect(dependencies.sessionStore.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        userId: user.id,
        role: Role.ADMIN,
        sessionVersion: 1
      }),
      28_800
    );
    expect(dependencies.loginAttemptLimiter.reset).toHaveBeenCalledOnce();
  });

  it("records a security event and rejects invalid credentials", async () => {
    const dependencies = createDependencies({ foundUser: null });
    const service = new AuthService(
      dependencies.userRepository,
      dependencies.sessionStore,
      dependencies.loginAttemptLimiter,
      dependencies.securityEvents
    );

    await expect(
      service.login(
        { email: "missing@uok.local", password: "wrong-password" },
        { ipAddress: "127.0.0.1", requestId: "request-2" }
      )
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(dependencies.sessionStore.create).not.toHaveBeenCalled();
    expect(dependencies.securityEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AUTH_LOGIN_FAILED",
        requestId: "request-2"
      })
    );
  });

  it("rejects a rate-limited login before checking credentials", async () => {
    const dependencies = createDependencies({ allowed: false });
    const service = new AuthService(
      dependencies.userRepository,
      dependencies.sessionStore,
      dependencies.loginAttemptLimiter,
      dependencies.securityEvents
    );

    await expect(
      service.login(
        { email: "admin@uok.local", password: "anything" },
        { ipAddress: "127.0.0.1", requestId: "request-3" }
      )
    ).rejects.toMatchObject({ status: 429 });

    expect(dependencies.userRepository.findByEmail).not.toHaveBeenCalled();
  });

  it("invalidates a session when the user session version changed", async () => {
    const session: AuthSession = {
      userId: user.id,
      role: Role.ADMIN,
      sessionVersion: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
    const dependencies = createDependencies({
      foundUser: { ...user, sessionVersion: 2 },
      session
    });
    const service = new AuthService(
      dependencies.userRepository,
      dependencies.sessionStore,
      dependencies.loginAttemptLimiter,
      dependencies.securityEvents
    );

    await expect(service.authenticate("opaque-token")).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(dependencies.sessionStore.delete).toHaveBeenCalledOnce();
  });
});
