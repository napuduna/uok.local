import { z } from "zod";

import { Role } from "./rbac.js";

export const roleSchema = z.enum([
  Role.ADMIN,
  Role.MANAGER,
  Role.SALES,
  Role.WAREHOUSE
]);

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128)
});

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: roleSchema
});

export const sessionResponseSchema = z.object({
  user: authenticatedUserSchema,
  expiresAt: z.string().datetime({ offset: true })
});

export const currentSessionResponseSchema = z.object({
  user: authenticatedUserSchema
});

export const changeUserRoleRequestSchema = z.object({
  role: roleSchema
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthenticatedUserResponse = z.infer<typeof authenticatedUserSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type CurrentSessionResponse = z.infer<
  typeof currentSessionResponseSchema
>;
export type ChangeUserRoleRequest = z.infer<typeof changeUserRoleRequestSchema>;
