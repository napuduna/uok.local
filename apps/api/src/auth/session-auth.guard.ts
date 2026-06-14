import {
  type CanActivate,
  type ExecutionContext,
  Injectable
} from "@nestjs/common";

import { AuthService } from "./auth.service";
import type { AuthenticatedRequest } from "./authenticated-request";

export const SESSION_COOKIE_NAME = "warehouse_session";

function readCookie(
  cookieHeader: string | undefined,
  cookieName: string
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const segment of cookieHeader.split(";")) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const name = segment.slice(0, separatorIndex).trim();
    if (name === cookieName) {
      return decodeURIComponent(segment.slice(separatorIndex + 1).trim());
    }
  }

  return undefined;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    request.auth = await this.authService.authenticate(token);
    return true;
  }
}
