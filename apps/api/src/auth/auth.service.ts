import { createHash, randomBytes } from "node:crypto";

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import bcrypt from "bcrypt";

import {
  LOGIN_ATTEMPT_LIMITER,
  type AuthenticatedUser,
  type AuthSession,
  type LoginAttemptLimiter,
  type LoginCredentials,
  type LoginResult,
  type RequestSecurityContext,
  SECURITY_EVENT_RECORDER,
  type SecurityEventRecorder,
  SESSION_STORE,
  type SessionStore,
  USER_REPOSITORY,
  type UserRepository
} from "./auth.types";

const SESSION_TTL_SECONDS = 8 * 60 * 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toAuthenticatedUser(
  user: Awaited<ReturnType<UserRepository["findSessionUserById"]>> & object
): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(SESSION_STORE)
    private readonly sessions: SessionStore,
    @Inject(LOGIN_ATTEMPT_LIMITER)
    private readonly loginAttempts: LoginAttemptLimiter,
    @Inject(SECURITY_EVENT_RECORDER)
    private readonly securityEvents: SecurityEventRecorder
  ) {}

  async login(
    credentials: LoginCredentials,
    context: RequestSecurityContext
  ): Promise<LoginResult> {
    const email = credentials.email.trim().toLowerCase();
    const limiterKey = `${context.ipAddress ?? "unknown"}:${email}`;
    const attempt = await this.loginAttempts.consume(limiterKey);

    if (!attempt.allowed) {
      await this.securityEvents.record({
        action: "AUTH_LOGIN_RATE_LIMITED",
        email,
        ipAddress: context.ipAddress,
        requestId: context.requestId,
        metadata: { retryAfterSeconds: attempt.retryAfterSeconds }
      });
      throw new HttpException(
        {
          code: "AUTH_RATE_LIMITED",
          message: "เข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง"
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const user = await this.users.findByEmail(email);
    const passwordMatches =
      user !== null &&
      user.isActive &&
      (await bcrypt.compare(credentials.password, user.passwordHash));

    if (!user || !passwordMatches) {
      await this.securityEvents.record({
        action: "AUTH_LOGIN_FAILED",
        email,
        ipAddress: context.ipAddress,
        requestId: context.requestId
      });
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
      });
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_SECONDS * 1000
    ).toISOString();
    const session: AuthSession = {
      userId: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
      expiresAt
    };

    await this.sessions.create(hashToken(token), session, SESSION_TTL_SECONDS);
    await this.loginAttempts.reset(limiterKey);
    await this.securityEvents.record({
      action: "AUTH_LOGIN_SUCCEEDED",
      actorId: user.id,
      email,
      ipAddress: context.ipAddress,
      requestId: context.requestId
    });

    return {
      token,
      user: toAuthenticatedUser(user),
      expiresAt
    };
  }

  async authenticate(token: string | undefined): Promise<AuthenticatedUser> {
    if (!token) {
      throw new UnauthorizedException({
        code: "AUTH_REQUIRED",
        message: "กรุณาเข้าสู่ระบบ"
      });
    }

    const tokenHash = hashToken(token);
    const session = await this.sessions.get(tokenHash);

    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (session) {
        await this.sessions.delete(tokenHash);
      }
      throw new UnauthorizedException({
        code: "SESSION_EXPIRED",
        message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"
      });
    }

    const user = await this.users.findSessionUserById(session.userId);
    const sessionIsCurrent =
      user?.isActive === true &&
      user.sessionVersion === session.sessionVersion &&
      user.role === session.role;

    if (!user || !sessionIsCurrent) {
      await this.sessions.delete(tokenHash);
      throw new UnauthorizedException({
        code: "SESSION_INVALID",
        message: "เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่"
      });
    }

    return toAuthenticatedUser(user);
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) {
      await this.sessions.delete(hashToken(token));
    }
  }
}
