import type { RoleValue } from "@warehouse/contracts";

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");
export const SESSION_STORE = Symbol("SESSION_STORE");
export const LOGIN_ATTEMPT_LIMITER = Symbol("LOGIN_ATTEMPT_LIMITER");
export const SECURITY_EVENT_RECORDER = Symbol("SECURITY_EVENT_RECORDER");

export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  sessionVersion: number;
  role: RoleValue;
}

export type SessionUserRecord = AuthUserRecord;

export interface AuthSession {
  userId: string;
  role: RoleValue;
  sessionVersion: number;
  expiresAt: string;
}

export interface UserRepository {
  findByEmail: (email: string) => Promise<AuthUserRecord | null>;
  findSessionUserById: (userId: string) => Promise<SessionUserRecord | null>;
}

export interface SessionStore {
  create: (
    tokenHash: string,
    session: AuthSession,
    ttlSeconds: number
  ) => Promise<void>;
  get: (tokenHash: string) => Promise<AuthSession | null>;
  delete: (tokenHash: string) => Promise<void>;
}

export interface LoginAttemptResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface LoginAttemptLimiter {
  consume: (key: string) => Promise<LoginAttemptResult>;
  reset: (key: string) => Promise<void>;
}

export interface SecurityEvent {
  action:
    | "AUTH_LOGIN_FAILED"
    | "AUTH_LOGIN_RATE_LIMITED"
    | "AUTH_LOGIN_SUCCEEDED"
    | "AUTH_SESSION_REJECTED";
  actorId?: string | undefined;
  requestId?: string | undefined;
  ipAddress?: string | undefined;
  email?: string | undefined;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface SecurityEventRecorder {
  record: (event: SecurityEvent) => Promise<void>;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RequestSecurityContext {
  requestId?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: RoleValue;
}

export interface LoginResult {
  token: string;
  user: AuthenticatedUser;
  expiresAt: string;
}
