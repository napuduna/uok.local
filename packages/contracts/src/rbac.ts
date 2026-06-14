export const Role = {
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  SALES: "SALES",
  WAREHOUSE: "WAREHOUSE"
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const Permission = {
  USER_MANAGE: "user:manage",
  DASHBOARD_VIEW: "dashboard:view",
  PRODUCT_READ: "product:read",
  PRODUCT_MANAGE: "product:manage",
  STOCK_READ: "stock:read",
  STOCK_MANAGE: "stock:manage",
  SALE_READ_ALL: "sale:read:all",
  SALE_READ_OWN: "sale:read:own",
  SALE_CREATE: "sale:create",
  SALE_CANCEL: "sale:cancel",
  CUSTOMER_READ: "customer:read",
  CUSTOMER_MANAGE: "customer:manage",
  COSTING_READ: "costing:read",
  REPORT_SALES_ALL: "report:sales:all",
  REPORT_SALES_OWN: "report:sales:own",
  REPORT_STOCK: "report:stock",
  EXPORT_ALL: "export:all",
  EXPORT_OWN: "export:own",
  EXPORT_STOCK: "export:stock",
  BACKUP_MANAGE: "backup:manage",
  AUDIT_READ: "audit:read"
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const allPermissions = Object.values(Permission);

export const permissionsByRole: Readonly<Record<Role, readonly Permission[]>> =
  {
    [Role.ADMIN]: allPermissions,
    [Role.MANAGER]: [
      Permission.DASHBOARD_VIEW,
      Permission.PRODUCT_READ,
      Permission.STOCK_READ,
      Permission.SALE_READ_ALL,
      Permission.CUSTOMER_READ,
      Permission.COSTING_READ,
      Permission.REPORT_SALES_ALL,
      Permission.REPORT_STOCK,
      Permission.EXPORT_ALL,
      Permission.AUDIT_READ
    ],
    [Role.SALES]: [
      Permission.DASHBOARD_VIEW,
      Permission.PRODUCT_READ,
      Permission.SALE_READ_OWN,
      Permission.SALE_CREATE,
      Permission.SALE_CANCEL,
      Permission.CUSTOMER_READ,
      Permission.CUSTOMER_MANAGE,
      Permission.REPORT_SALES_OWN,
      Permission.EXPORT_OWN
    ],
    [Role.WAREHOUSE]: [
      Permission.DASHBOARD_VIEW,
      Permission.PRODUCT_READ,
      Permission.PRODUCT_MANAGE,
      Permission.STOCK_READ,
      Permission.STOCK_MANAGE,
      Permission.REPORT_STOCK,
      Permission.EXPORT_STOCK
    ]
  };

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsByRole[role].includes(permission);
}
