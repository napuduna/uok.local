import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import type { Response } from "express";

import { loginRequestSchema } from "@warehouse/contracts";

import type { AuthenticatedRequest } from "./authenticated-request";
import { AuthService } from "./auth.service";
import { SESSION_COOKIE_NAME, SessionAuthGuard } from "./session-auth.guard";

const SESSION_MAX_AGE_MILLISECONDS = 8 * 60 * 60 * 1000;

function readSessionToken(
  cookieHeader: string | undefined
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const prefix = `${SESSION_COOKIE_NAME}=`;
  const segment = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));

  return segment ? decodeURIComponent(segment.slice(prefix.length)) : undefined;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const parsed = loginRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "ข้อมูลเข้าสู่ระบบไม่ถูกต้อง",
        details: parsed.error.flatten()
      });
    }

    const result = await this.authService.login(parsed.data, {
      requestId: request.requestId,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
    response.cookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_MAX_AGE_MILLISECONDS
    });

    return {
      user: result.user,
      expiresAt: result.expiresAt
    };
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.authService.logout(readSessionToken(request.headers.cookie));
    response.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/"
    });
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  currentSession(@Req() request: AuthenticatedRequest) {
    return { user: request.auth };
  }
}
