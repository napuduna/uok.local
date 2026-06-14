import { SetMetadata } from "@nestjs/common";

import type { PermissionValue } from "@warehouse/contracts";

export const REQUIRED_PERMISSIONS_KEY = "required-permissions";

export const RequirePermissions = (...permissions: PermissionValue[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
