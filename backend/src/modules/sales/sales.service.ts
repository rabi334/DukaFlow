import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod, StockMovementType, SaleStatus } from '@prisma/client';
import { CartItemDto, CheckoutDto } from './dto/checkout.dto';

export { CartItemDto, CheckoutDto };

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

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
      let subtotal = 0;
      let totalDiscount = 0;
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

        const unitPrice = cartItem.unitPrice ?? Number(product.sellingPrice);
        const costPrice = Number(product.costPrice);
        const itemDiscount = cartItem.discountAmount ?? 0;
        const lineTotal = unitPrice * cartItem.quantity - itemDiscount;

        subtotal += lineTotal;
        totalDiscount += itemDiscount;

        preparedItems.push({
          productId: product.id,
          productName: product.name,
          quantity: cartItem.quantity,
          unitPriceSnapshot: unitPrice,
          costPriceSnapshot: costPrice,
          discountAmount: itemDiscount,
          lineTotal,
          previousStock: currentStock,
        });
      }

      // Calculate tax if configured
      const taxRate = Number(org.taxRate || 0.15);
      const taxAmount = org.taxInclusive
        ? subtotal - subtotal / (1 + taxRate)
        : subtotal * taxRate;
      const totalAmount = org.taxInclusive ? subtotal : subtotal + taxAmount;

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
          notes: dto.notes,
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
        const newStock = item.previousStock - item.quantity;
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
            quantity: -item.quantity,
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
          amount: dto.amountPaid ?? totalAmount,
          referenceNumber: dto.paymentReference,
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

  async getSales(organizationId: string, options?: { limit?: number; cashierId?: string }) {
    const where: any = { organizationId };
    if (options?.cashierId) {
      where.cashierUserId = options.cashierId;
    }

    return this.prisma.sale.findMany({
      where,
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
        payments: true,
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
            product: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
        payments: true,
        organization: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Sale record not found');
    }

    return sale;
  }
}
