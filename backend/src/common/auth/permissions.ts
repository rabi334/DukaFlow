export enum AppRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  INVENTORY_STAFF = 'inventory_staff',
  PLATFORM_ADMIN = 'platform_admin',
}

export enum AppPermission {
  // Financial & Reports
  REPORTS_VIEW_FINANCIAL = 'reports:view_financial', // Gross profit, net profit, COGS, inventory valuation
  REPORTS_VIEW_OPERATIONAL = 'reports:view_operational', // Total sales, low stock alerts, transaction counts
  REPORTS_VIEW_CASHIER = 'reports:view_cashier', // Own cashier sales metrics
  REPORTS_VIEW_INVENTORY = 'reports:view_inventory', // Warehouse stock metrics

  // Products
  PRODUCTS_VIEW = 'products:view',
  PRODUCTS_VIEW_COST_PRICE = 'products:view_cost_price', // Sensitive wholesale cost price
  PRODUCTS_MANAGE = 'products:manage', // Create, update, archive products & categories

  // Inventory
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_ADJUST = 'inventory:adjust',

  // Sales & POS
  POS_CHECKOUT = 'pos:checkout',
  SALES_VIEW_ALL = 'sales:view_all', // View transactions of all cashiers
  SALES_VIEW_OWN = 'sales:view_own', // View only own transactions
  SALES_VIEW_COST_PRICE = 'sales:view_cost_price', // View costPriceSnapshot and line profit

  // Purchases & Suppliers
  PURCHASES_VIEW = 'purchases:view',
  PURCHASES_MANAGE = 'purchases:manage',
  PURCHASES_RECEIVE = 'purchases:receive',

  // Expenses
  EXPENSES_VIEW = 'expenses:view',
  EXPENSES_MANAGE = 'expenses:manage',

  // Settings & Business Ownership
  SETTINGS_VIEW = 'settings:view',
  SETTINGS_MANAGE = 'settings:manage', // Business name, tax rate, currency, tin, receipt templates

  // Staff & Memberships
  STAFF_VIEW = 'staff:view',
  STAFF_MANAGE = 'staff:manage', // Invite, update role, deactivate staff

  // Platform Level
  PLATFORM_MANAGE = 'platform:manage',
}

// Centralized Role to Permissions Mapping
export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  [AppRole.OWNER]: [
    AppPermission.REPORTS_VIEW_FINANCIAL,
    AppPermission.REPORTS_VIEW_OPERATIONAL,
    AppPermission.REPORTS_VIEW_CASHIER,
    AppPermission.REPORTS_VIEW_INVENTORY,
    AppPermission.PRODUCTS_VIEW,
    AppPermission.PRODUCTS_VIEW_COST_PRICE,
    AppPermission.PRODUCTS_MANAGE,
    AppPermission.INVENTORY_VIEW,
    AppPermission.INVENTORY_ADJUST,
    AppPermission.POS_CHECKOUT,
    AppPermission.SALES_VIEW_ALL,
    AppPermission.SALES_VIEW_OWN,
    AppPermission.SALES_VIEW_COST_PRICE,
    AppPermission.PURCHASES_VIEW,
    AppPermission.PURCHASES_MANAGE,
    AppPermission.PURCHASES_RECEIVE,
    AppPermission.EXPENSES_VIEW,
    AppPermission.EXPENSES_MANAGE,
    AppPermission.SETTINGS_VIEW,
    AppPermission.SETTINGS_MANAGE,
    AppPermission.STAFF_VIEW,
    AppPermission.STAFF_MANAGE,
  ],

  [AppRole.MANAGER]: [
    AppPermission.REPORTS_VIEW_OPERATIONAL,
    AppPermission.REPORTS_VIEW_CASHIER,
    AppPermission.REPORTS_VIEW_INVENTORY,
    AppPermission.PRODUCTS_VIEW,
    AppPermission.PRODUCTS_VIEW_COST_PRICE,
    AppPermission.PRODUCTS_MANAGE,
    AppPermission.INVENTORY_VIEW,
    AppPermission.INVENTORY_ADJUST,
    AppPermission.POS_CHECKOUT,
    AppPermission.SALES_VIEW_ALL,
    AppPermission.SALES_VIEW_OWN,
    AppPermission.PURCHASES_VIEW,
    AppPermission.PURCHASES_MANAGE,
    AppPermission.PURCHASES_RECEIVE,
    AppPermission.EXPENSES_VIEW,
    AppPermission.EXPENSES_MANAGE,
    AppPermission.STAFF_VIEW,
    AppPermission.SETTINGS_VIEW,
    // Note: Managers CANNOT perform SETTINGS_MANAGE or STAFF_MANAGE (owner-only actions)
  ],

  [AppRole.CASHIER]: [
    AppPermission.POS_CHECKOUT,
    AppPermission.PRODUCTS_VIEW, // Read-only catalog lookup without wholesale cost price
    AppPermission.SALES_VIEW_OWN, // View only own cashier receipts
    AppPermission.REPORTS_VIEW_CASHIER, // View own cashier end-of-day summary
    // Explicitly DENIED: PRODUCTS_VIEW_COST_PRICE, SALES_VIEW_ALL, SALES_VIEW_COST_PRICE,
    // REPORTS_VIEW_FINANCIAL, EXPENSES_VIEW, EXPENSES_MANAGE, PURCHASES_VIEW, SETTINGS_MANAGE
  ],

  [AppRole.INVENTORY_STAFF]: [
    AppPermission.PRODUCTS_VIEW,
    AppPermission.PRODUCTS_VIEW_COST_PRICE,
    AppPermission.PRODUCTS_MANAGE,
    AppPermission.INVENTORY_VIEW,
    AppPermission.INVENTORY_ADJUST,
    AppPermission.PURCHASES_RECEIVE,
    AppPermission.REPORTS_VIEW_INVENTORY,
    // Explicitly DENIED: POS_CHECKOUT, SALES_VIEW_ALL, SALES_VIEW_OWN,
    // REPORTS_VIEW_FINANCIAL, EXPENSES_VIEW, SETTINGS_MANAGE, STAFF_MANAGE
  ],

  [AppRole.PLATFORM_ADMIN]: [
    AppPermission.PLATFORM_MANAGE,
    // Platform administrators manage platform infrastructure and account status,
    // but do not have unrestricted access to tenant private financials without explicit membership.
  ],
};

export function normalizeRole(role: string | null | undefined): AppRole | null {
  if (!role) return null;
  const lower = role.toLowerCase().trim();
  switch (lower) {
    case 'owner':
      return AppRole.OWNER;
    case 'manager':
      return AppRole.MANAGER;
    case 'cashier':
      return AppRole.CASHIER;
    case 'inventory_staff':
    case 'inventory':
      return AppRole.INVENTORY_STAFF;
    case 'admin':
    case 'platform_admin':
      return AppRole.PLATFORM_ADMIN;
    default:
      return null;
  }
}

export function roleHasPermission(role: string | null | undefined, permission: AppPermission): boolean {
  const norm = normalizeRole(role);
  if (!norm) return false;
  const permissions = ROLE_PERMISSIONS[norm] || [];
  return permissions.includes(permission);
}

export function getPermissionsForRole(role: string | null | undefined): AppPermission[] {
  const norm = normalizeRole(role);
  if (!norm) return [];
  return ROLE_PERMISSIONS[norm] || [];
}
