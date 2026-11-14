import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, StockMovementType, SaleStatus, Prisma } from '@prisma/client';
import { CartItemDto, CheckoutDto } from './dto/checkout.dto';
import { ProcessReturnDto, ReturnItemDto } from './dto/return.dto';

export { CartItemDto, CheckoutDto, ProcessReturnDto, ReturnItemDto };

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // POS CHECKOUT
  // ==========================================

  async checkout(organizationId: string, cashierUserId: string, dto: CheckoutDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Checkout cart cannot be empty');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Execute atomic checkout in a single database transaction
    return this.prisma.$transaction(async (tx) => {
      let subtotal = new Prisma.Decimal(0);
      let totalDiscount = new Prisma.Decimal(0);
      const preparedItems: any[] = [];

      // Generate receipt number (sequential per organization)
      const count = await tx.sale.count({ where: { organizationId } });
      const receiptNumber = `REC-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      // Validate products, check stock, and prepare lines
      for (const cartItem of dto.items) {
        const product = await tx.product.findFirst({
          where: {
            id: cartItem.productId,
            organizationId,
            isArchived: false,
          },
          include: { inventory: true },
        });

        if (!product) {
          throw new NotFoundException(`Product ID ${cartItem.productId} not found`);
        }

        const currentStock = Number(product.inventory?.quantityOnHand || 0);
        if (currentStock < cartItem.quantity && !org.allowNegative) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}". Available: ${currentStock}, requested: ${cartItem.quantity}`,
          );
        }

        const unitPrice = new Prisma.Decimal(cartItem.unitPrice ?? product.sellingPrice);
        const costPrice = new Prisma.Decimal(product.costPrice);
        const itemDiscount = new Prisma.Decimal(cartItem.discountAmount ?? 0);
        const itemQty = new Prisma.Decimal(cartItem.quantity);
        const lineTotal = unitPrice.mul(itemQty).sub(itemDiscount);

        subtotal = subtotal.add(lineTotal);
        totalDiscount = totalDiscount.add(itemDiscount);

        preparedItems.push({
          productId: product.id,
          productName: product.name,
          quantity: itemQty,
          unitPriceSnapshot: unitPrice,
          costPriceSnapshot: costPrice,
          discountAmount: itemDiscount,
          lineTotal,
          previousStock: currentStock,
        });
      }

      // Calculate tax if configured
      const taxRate = new Prisma.Decimal(org.taxRate || 0.15);
      const taxAmount = org.taxInclusive
        ? subtotal.sub(subtotal.div(taxRate.add(1)))
        : subtotal.mul(taxRate);
      const totalAmount = org.taxInclusive ? subtotal : subtotal.add(taxAmount);

      // Create Sale Header
      const sale = await tx.sale.create({
        data: {
          organizationId,
          cashierUserId,
          receiptNumber,
          subtotal,
          discountAmount: totalDiscount,
          taxAmount,
          totalAmount,
          status: SaleStatus.COMPLETED,
          notes: dto.notes?.trim() || null,
        },
      });

      // Create Sale Items, update Inventory & append Stock Movements
      for (const item of preparedItems) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPriceSnapshot: item.unitPriceSnapshot,
            costPriceSnapshot: item.costPriceSnapshot,
            discountAmount: item.discountAmount,
            lineTotal: item.lineTotal,
          },
        });

        // Decrement inventory balance
        const newStock = Number(item.previousStock) - Number(item.quantity);
        await tx.inventory.update({
          where: { productId: item.productId },
          data: { quantityOnHand: newStock },
        });

        // Append to inventory movements ledger
        await tx.inventoryMovement.create({
          data: {
            organizationId,
            productId: item.productId,
            actorUserId: cashierUserId,
            type: StockMovementType.SALE,
            quantity: -Number(item.quantity),
            reason: `POS Sale Receipt ${receiptNumber}`,
            referenceId: sale.id,
          },
        });
      }

      // Record Payment
      const payment = await tx.payment.create({
        data: {
          saleId: sale.id,
          method: dto.paymentMethod,
          amount: new Prisma.Decimal(dto.amountPaid ?? totalAmount),
          referenceNumber: dto.paymentReference?.trim() || null,
        },
      });

      return {
        ...sale,
        items: preparedItems,
        payment,
        organization: {
          name: org.name,
          city: org.city,
          address: org.address,
          phoneNumber: org.phoneNumber,
          tinNumber: org.tinNumber,
          receiptHeader: org.receiptHeader,
          receiptFooter: org.receiptFooter,
          currency: org.currency,
        },
      };
    });
  }

  // ==========================================
  // SALES HISTORY
  // ==========================================

  async getSales(
    organizationId: string,
    options?: {
      limit?: number;
      cashierId?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: any = { organizationId };

    if (options?.cashierId) {
      where.cashierUserId = options.cashierId;
    }

    if (options?.search && options.search.trim()) {
      where.receiptNumber = { contains: options.search.trim(), mode: 'insensitive' };
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = new Date(options.startDate);
      }
      if (options.endDate) {
        const end = new Date(options.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    return this.prisma.sale.findMany({
      where,
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true, costPrice: true } },
            returnItems: true,
          },
        },
        payments: true,
        returns: {
          include: {
            items: true,
            cashier: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }

  async getSaleById(organizationId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId },
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true, costPrice: true } },
            returnItems: true,
          },
        },
        payments: true,
        returns: {
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, sku: true } },
              },
            },
            cashier: { select: { id: true, name: true } },
          },
        },
        organization: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale record not found');
    }

    return sale;
  }

  // ==========================================
  // RETURNS AND REFUNDS
  // ==========================================

  async processReturn(
    organizationId: string,
    userId: string,
    saleId: string,
    dto: ProcessReturnDto,
  ) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      include: {
        items: {
          include: {
            product: true,
            returnItems: true,
          },
        },
        returns: {
          include: { items: true },
        },
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale record not found');
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('Cannot process return on a cancelled sale');
    }

    // Check duplicate saleItemIds in return payload
    const seenItemIds = new Set<string>();
    for (const item of dto.items) {
      if (seenItemIds.has(item.saleItemId)) {
        throw new BadRequestException(`Duplicate item ${item.saleItemId} in return request`);
      }
      seenItemIds.add(item.saleItemId);
    }

    // Validate quantities and calculate refund lines
    const preparedReturns: Array<{
      saleItemId: string;
      productId: string;
      productName: string;
      quantity: Prisma.Decimal;
      refundAmount: Prisma.Decimal;
    }> = [];

    let totalRefundAmount = new Prisma.Decimal(0);

    for (const retItem of dto.items) {
      const line = sale.items.find((i) => i.id === retItem.saleItemId);
      if (!line) {
        throw new BadRequestException(
          `Sale item ${retItem.saleItemId} does not belong to sale receipt ${sale.receiptNumber}`,
        );
      }

      if (retItem.quantity <= 0) {
        throw new BadRequestException('Return quantity must be greater than zero');
      }

      // Calculate already returned quantity for this line item
      const alreadyReturned = line.returnItems.reduce((acc, ri) => {
        return acc.add(new Prisma.Decimal(ri.quantity));
      }, new Prisma.Decimal(0));

      const lineQuantity = new Prisma.Decimal(line.quantity);
      const remainingReturnable = lineQuantity.sub(alreadyReturned);

      const requestedQty = new Prisma.Decimal(retItem.quantity);

      if (requestedQty.gt(remainingReturnable)) {
        throw new BadRequestException(
          `Cannot return ${retItem.quantity} units of "${line.product.name}". Only ${remainingReturnable} units remain returnable from this sale.`,
        );
      }

      // Calculate prorated line refund: (lineTotal / quantity) * returnedQty
      const effectiveUnitRefund = new Prisma.Decimal(line.lineTotal).div(lineQuantity);
      const itemRefundAmount = effectiveUnitRefund.mul(requestedQty);
      totalRefundAmount = totalRefundAmount.add(itemRefundAmount);

      preparedReturns.push({
        saleItemId: line.id,
        productId: line.productId,
        productName: line.product.name,
        quantity: requestedQty,
        refundAmount: itemRefundAmount,
      });
    }

    // Execute atomic transaction for Return Record, Inventory Restock, and Sale Status
    return this.prisma.$transaction(async (tx) => {
      // 1. Generate return number
      const returnCount = await tx.saleReturn.count({ where: { organizationId } });
      const returnNumber = `RET-${new Date().getFullYear()}-${String(returnCount + 1).padStart(5, '0')}`;

      const restock = dto.restockInventory !== false;

      // 2. Create SaleReturn header and items
      const saleReturn = await tx.saleReturn.create({
        data: {
          organizationId,
          saleId: sale.id,
          returnNumber,
          cashierUserId: userId,
          refundAmount: totalRefundAmount,
          refundMethod: dto.refundMethod || PaymentMethod.CASH,
          reason: dto.reason?.trim() || 'Customer return',
          restocked: restock,
          items: {
            create: preparedReturns.map((p) => ({
              saleItemId: p.saleItemId,
              productId: p.productId,
              quantity: p.quantity,
              refundAmount: p.refundAmount,
            })),
          },
        },
        include: {
          items: {
            include: { product: true },
          },
          cashier: { select: { id: true, name: true, email: true } },
          sale: { select: { id: true, receiptNumber: true, totalAmount: true } },
        },
      });

      // 3. Optional inventory restocking
      if (restock) {
        for (const item of preparedReturns) {
          const inv = await tx.inventory.findUnique({
            where: { productId: item.productId },
          });

          const currentQty = inv ? new Prisma.Decimal(inv.quantityOnHand) : new Prisma.Decimal(0);
          const newQty = currentQty.add(item.quantity);

          await tx.inventory.upsert({
            where: { productId: item.productId },
            update: { quantityOnHand: newQty },
            create: { productId: item.productId, quantityOnHand: newQty },
          });

          // Ledger entry
          await tx.inventoryMovement.create({
            data: {
              organizationId,
              productId: item.productId,
              actorUserId: userId,
              type: StockMovementType.SALE_RETURN,
              quantity: item.quantity,
              reason: `Sale Return ${returnNumber} for receipt ${sale.receiptNumber}`,
              referenceId: saleReturn.id,
            },
          });
        }
      }

      // 4. Check if the entire sale is now fully refunded
      const allReturnsForSale = await tx.saleReturnItem.findMany({
        where: { saleReturn: { saleId: sale.id } },
      });

      const totalReturnedPerItem: Record<string, Prisma.Decimal> = {};
      for (const ret of allReturnsForSale) {
        totalReturnedPerItem[ret.saleItemId] = (
          totalReturnedPerItem[ret.saleItemId] || new Prisma.Decimal(0)
        ).add(new Prisma.Decimal(ret.quantity));
      }

      const allItemsFullyReturned = sale.items.every((line) => {
        const returned = totalReturnedPerItem[line.id] || new Prisma.Decimal(0);
        return returned.gte(new Prisma.Decimal(line.quantity));
      });

      if (allItemsFullyReturned) {
        await tx.sale.update({
          where: { id: sale.id },
          data: { status: SaleStatus.REFUNDED },
        });
      }

      return saleReturn;
    });
  }

  async getReturns(
    organizationId: string,
    options?: { saleId?: string; cashierId?: string; limit?: number },
  ) {
    const where: any = { organizationId };

    if (options?.saleId) {
      where.saleId = options.saleId;
    }

    if (options?.cashierId) {
      where.cashierUserId = options.cashierId;
    }

    return this.prisma.saleReturn.findMany({
      where,
      include: {
        sale: { select: { id: true, receiptNumber: true, totalAmount: true } },
        cashier: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }
}
