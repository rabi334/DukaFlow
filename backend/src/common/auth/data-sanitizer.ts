import { AppPermission, roleHasPermission } from './permissions';

/**
 * Sanitizes a product object based on the user's role permissions.
 * Removes wholesale costPrice for roles lacking PRODUCTS_VIEW_COST_PRICE (such as Cashiers).
 */
export function sanitizeProductForRole(product: any, userRole: string | null | undefined): any {
  if (!product) return product;

  const canViewCost = roleHasPermission(userRole, AppPermission.PRODUCTS_VIEW_COST_PRICE);
  if (canViewCost) {
    return product;
  }

  // Clone to avoid mutating internal cached instances
  const clone = { ...product };
  delete clone.costPrice;

  // Also sanitize nested inventory if cost is referenced
  if (clone.inventory) {
    const invClone = { ...clone.inventory };
    delete (invClone as any).costPrice;
    clone.inventory = invClone;
  }

  return clone;
}

export function sanitizeProductsForRole(products: any[], userRole: string | null | undefined): any[] {
  if (!Array.isArray(products)) return [];
  const canViewCost = roleHasPermission(userRole, AppPermission.PRODUCTS_VIEW_COST_PRICE);
  if (canViewCost) {
    return products;
  }
  return products.map((p) => sanitizeProductForRole(p, userRole));
}

/**
 * Sanitizes sales transaction records based on the user's role permissions.
 * Removes costPriceSnapshot and gross profit calculations for roles lacking SALES_VIEW_COST_PRICE (such as Cashiers).
 */
export function sanitizeSaleForRole(sale: any, userRole: string | null | undefined): any {
  if (!sale) return sale;

  const canViewCost = roleHasPermission(userRole, AppPermission.SALES_VIEW_COST_PRICE);
  if (canViewCost) {
    return sale;
  }

  const clone = { ...sale };

  // Remove profit calculations if present on header
  delete (clone as any).grossProfit;
  delete (clone as any).costOfGoodsSold;

  // Sanitize line items to remove costPriceSnapshot
  if (Array.isArray(clone.items)) {
    clone.items = clone.items.map((item: any) => {
      const itemClone = { ...item };
      delete itemClone.costPriceSnapshot;
      delete (itemClone as any).profit;
      if (itemClone.product) {
        itemClone.product = sanitizeProductForRole(itemClone.product, userRole);
      }
      return itemClone;
    });
  }

  return clone;
}

export function sanitizeSalesForRole(sales: any[], userRole: string | null | undefined): any[] {
  if (!Array.isArray(sales)) return [];
  return sales.map((s) => sanitizeSaleForRole(s, userRole));
}
