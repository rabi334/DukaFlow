import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, StockMovementType, SaleStatus, ReturnStatus, Prisma } from '@prisma/client';
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
    // 1. Basic sanity check on payload item uniqueness
    const seenItemIds = new Set<string>();
    for (const item of dto.items) {
      if (seenItemIds.has(item.saleItemId)) {
        throw new BadRequestException(`Duplicate item ${item.saleItemId} in return request`);
      }
      seenItemIds.add(item.saleItemId);
    }

    // 2. Execute entire return lifecycle inside database transaction with row-level locking
    return this.prisma.$transaction(async (tx) => {
      // Acquire PostgreSQL exclusive row-level lock on the parent sale
      // Serializes concurrent return requests for the same sale
      const lockedSale: any[] = await tx.$queryRaw`
        SELECT id, status, organization_id, receipt_number
        FROM sales
        WHERE id = ${saleId} AND organization_id = ${organizationId}
        FOR UPDATE
      `;

      if (!lockedSale || lockedSale.length === 0) {
        throw new NotFoundException('Sale record not found');
      }

      // Re-fetch sale and its full line item return history under transaction lock
      const sale = await tx.sale.findFirst({
        where: { id: saleId, organizationId },
        include: {
          items: {
            include: {
              product: true,
              returnItems: {
                where: {
                  saleReturn: { status: { not: ReturnStatus.FAILED } },
                },
              },
            },
          },
          payments: true,
          returns: {
            where: { status: ReturnStatus.COMPLETED },
          },
        },
      });

      if (!sale) {
        throw new NotFoundException('Sale record not found');
      }

      if (sale.status === SaleStatus.CANCELLED) {
        throw new BadRequestException('Cannot process return on a cancelled sale');
      }

      // Validate quantities and calculate refund lines using latest committed data
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

        // Calculate cumulative already returned quantity for this line item under lock
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

        // Calculate prorated line refund:
        // Allocates original customer payment (including line discount and tax) to returned quantity.
        // In tax-exclusive mode (totalAmount > subtotal), lineTotal * (totalAmount / subtotal) recovers customer's tax.
        // In tax-inclusive mode (totalAmount == subtotal), taxMultiplier is 1.0 (tax is not added twice).
        const subtotalDec = new Prisma.Decimal(sale.subtotal);
        const totalAmountDec = new Prisma.Decimal(sale.totalAmount);
        const taxMultiplier = subtotalDec.gt(0)
          ? totalAmountDec.div(subtotalDec)
          : new Prisma.Decimal(1);

        const effectiveLinePaid = new Prisma.Decimal(line.lineTotal).mul(taxMultiplier);
        const effectiveUnitRefund = effectiveLinePaid.div(lineQuantity);

        const alreadyRefundedAmount = line.returnItems.reduce((acc, ri) => {
          return acc.add(new Prisma.Decimal(ri.refundAmount));
        }, new Prisma.Decimal(0));

        let itemRefundAmount: Prisma.Decimal;
        if (requestedQty.equals(remainingReturnable)) {
          // Full return of remaining line items: refund exact remaining balance
          // to eliminate fractional penny drift
          itemRefundAmount = effectiveLinePaid.sub(alreadyRefundedAmount);
        } else {
          itemRefundAmount = effectiveUnitRefund.mul(requestedQty).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        }

        totalRefundAmount = totalRefundAmount.add(itemRefundAmount);

        preparedReturns.push({
          saleItemId: line.id,
          productId: line.productId,
          productName: line.product.name,
          quantity: requestedQty,
          refundAmount: itemRefundAmount,
        });
      }

      // Calculate total merchandise value returned in this request
      const totalReturnCredit = totalRefundAmount;

      // Cumulative payments made by customer on this sale
      const totalPaid = sale.payments.reduce(
        (acc, p) => acc.add(new Prisma.Decimal(p.amount)),
        new Prisma.Decimal(0),
      );

      // Cumulative cash/electronic refunds already disbursed across prior returns on this sale
      const alreadyDisbursed = sale.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.refundDisbursed || r.refundAmount)),
        new Prisma.Decimal(0),
      );

      // Cumulative customer credit already disbursed across prior returns on this sale
      const alreadyCreditDisbursed = sale.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.customerCreditDisbursed || 0)),
        new Prisma.Decimal(0),
      );

      // Cumulative return credits across prior returns on this sale
      const previousReturnCredits = sale.returns.reduce(
        (acc, r) => acc.add(new Prisma.Decimal(r.returnCredit || r.refundAmount)),
        new Prisma.Decimal(0),
      );

      // Cumulative merchandise returned after this return
      const cumulativeReturnedValue = previousReturnCredits.add(totalReturnCredit);

      // Retained merchandise value remaining with the customer
      const retainedGoodsValue = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        new Prisma.Decimal(sale.totalAmount).sub(cumulativeReturnedValue),
      );

      // Target net amount customer should have paid for retained goods
      // Legitimate cumulative refund customer is entitled to receive:
      const targetCumulativeDisbursement = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        totalPaid.sub(retainedGoodsValue),
      );

      // Remaining refundable cash balance available from customer payments
      const remainingRefundableCash = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        totalPaid.sub(alreadyDisbursed).sub(alreadyCreditDisbursed),
      );

      // Actual cash/electronic disbursement for THIS return:
      // This is capped at the return credit amount — a return refund cannot exceed
      // the value of goods being returned.
      const rawDisbursement = Prisma.Decimal.min(
        remainingRefundableCash,
        Prisma.Decimal.max(new Prisma.Decimal(0), targetCumulativeDisbursement.sub(alreadyDisbursed).sub(alreadyCreditDisbursed)),
      ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      // Split disbursement into: refund against returned goods vs settlement of prior customer credit
      const refundDisbursed = Prisma.Decimal.min(rawDisbursement, totalReturnCredit)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const customerCreditDisbursed = rawDisbursement.sub(refundDisbursed)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      // Portion of return credit that cancels customer's unpaid invoice balance
      // (can never be negative: refundDisbursed ≤ totalReturnCredit is guaranteed above)
      const unpaidCancelled = totalReturnCredit.sub(refundDisbursed);

      // Total actual money given back to customer = refund for goods + prior credit settlement
      const totalDisbursedToCustomer = refundDisbursed.add(customerCreditDisbursed);

      // Generate return number
      const returnCount = await tx.saleReturn.count({ where: { organizationId } });
      const returnNumber = `RET-${new Date().getFullYear()}-${String(returnCount + 1).padStart(5, '0')}`;

      const restock = dto.restockInventory !== false;
      const initialStatus = dto.status || ReturnStatus.COMPLETED;
      const isCompleted = initialStatus === ReturnStatus.COMPLETED;

      // Create SaleReturn header and items
      const saleReturn = await tx.saleReturn.create({
        data: {
          organizationId,
          saleId: sale.id,
          returnNumber,
          cashierUserId: userId,
          returnCredit: totalReturnCredit,
          refundDisbursed,
          customerCreditDisbursed,
          unpaidCancelled,
          refundAmount: totalDisbursedToCustomer, // Full customer payout (goods refund + credit settlement)
          refundMethod: dto.refundMethod || PaymentMethod.CASH,
          status: initialStatus,
          completedAt: isCompleted ? new Date() : null,
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

      // Optional inventory restocking (strictly on COMPLETED returns)
      if (isCompleted && restock) {
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

      // Check if the entire sale is now fully refunded (strictly on COMPLETED returns)
      if (isCompleted) {
        const allReturnsForSale = await tx.saleReturnItem.findMany({
          where: {
            saleReturn: {
              saleId: sale.id,
              status: ReturnStatus.COMPLETED,
            },
          },
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
      }

      return saleReturn;
    });
  }

  /**
   * Complete a previously PENDING return.
   * Performs stock restoration (if configured) exactly once upon completion,
   * updates status to COMPLETED, sets completedAt, and transitions sale to REFUNDED if applicable.
   */
  async completeReturn(organizationId: string, userId: string, returnId: string) {
    return this.prisma.$transaction(async (tx) => {
      const saleReturn = await tx.saleReturn.findFirst({
        where: { id: returnId, organizationId },
        include: {
          items: true,
          sale: {
            include: {
              items: true,
            },
          },
        },
      });

      if (!saleReturn) {
        throw new NotFoundException('Return record not found');
      }

      if (saleReturn.status === ReturnStatus.COMPLETED) {
        throw new BadRequestException('Return is already completed');
      }

      if (saleReturn.status === ReturnStatus.FAILED) {
        throw new BadRequestException('Cannot complete a failed return');
      }

      const completedAt = new Date();

      // 1. Restock inventory if restocked is true (performed exactly once upon completion)
      if (saleReturn.restocked) {
        for (const item of saleReturn.items) {
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
              reason: `Sale Return ${saleReturn.returnNumber} completion for receipt ${saleReturn.sale.receiptNumber}`,
              referenceId: saleReturn.id,
            },
          });
        }
      }

      // 2. Mark Return status COMPLETED with completedAt
      const updatedReturn = await tx.saleReturn.update({
        where: { id: returnId },
        data: {
          status: ReturnStatus.COMPLETED,
          completedAt,
        },
        include: {
          items: { include: { product: true } },
          sale: { select: { id: true, receiptNumber: true, totalAmount: true } },
          cashier: { select: { id: true, name: true, email: true } },
        },
      });

      // 3. Check if all items in the sale are now fully returned
      const allReturnsForSale = await tx.saleReturnItem.findMany({
        where: {
          saleReturn: {
            saleId: saleReturn.saleId,
            status: ReturnStatus.COMPLETED,
          },
        },
      });

      const totalReturnedPerItem: Record<string, Prisma.Decimal> = {};
      for (const ret of allReturnsForSale) {
        totalReturnedPerItem[ret.saleItemId] = (
          totalReturnedPerItem[ret.saleItemId] || new Prisma.Decimal(0)
        ).add(new Prisma.Decimal(ret.quantity));
      }

      const allItemsFullyReturned = saleReturn.sale.items.every((line) => {
        const returned = totalReturnedPerItem[line.id] || new Prisma.Decimal(0);
        return returned.gte(new Prisma.Decimal(line.quantity));
      });

      if (allItemsFullyReturned) {
        await tx.sale.update({
          where: { id: saleReturn.saleId },
          data: { status: SaleStatus.REFUNDED },
        });
      }

      return updatedReturn;
    });
  }

  /**
   * Mark a PENDING return as FAILED.
   * Releases any reserved quantities without restoring inventory.
   */
  async failReturn(organizationId: string, userId: string, returnId: string, reason?: string) {
    const saleReturn = await this.prisma.saleReturn.findFirst({
      where: { id: returnId, organizationId },
    });

    if (!saleReturn) {
      throw new NotFoundException('Return record not found');
    }

    if (saleReturn.status === ReturnStatus.COMPLETED) {
      throw new BadRequestException('Cannot fail an already completed return');
    }

    return this.prisma.saleReturn.update({
      where: { id: returnId },
      data: {
        status: ReturnStatus.FAILED,
        reason: reason?.trim() || saleReturn.reason || 'Return processing failed',
      },
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
