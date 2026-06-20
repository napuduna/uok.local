import { SetMetadata } from "@nestjs/common";

import type { PermissionValue } from "@warehouse/contracts";

export const REQUIRED_PERMISSIONS_KEY = "required-permissions";
export const REQUIRED_ANY_PERMISSIONS_KEY = "required-any-permissions";

export const RequirePermissions = (...permissions: PermissionValue[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const RequireAnyPermissions = (...permissions: PermissionValue[]) =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions);
