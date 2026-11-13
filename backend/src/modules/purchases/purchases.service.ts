import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseStatus, StockMovementType } from '@prisma/client';

export interface CreatePurchaseDto {
  supplierId: string;
  items: {
    productId: string;
    orderedQty: number;
    unitCost: number;
  }[];
  notes?: string;
}

export interface ReceiveItemsDto {
  receivedItems: {
    purchaseItemId: string;
    receivedQty: number;
  }[];
}

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  // Suppliers
  async getSuppliers(organizationId: string) {
    return this.prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(organizationId: string, data: any) {
    return this.prisma.supplier.create({
      data: {
        organizationId,
        name: data.name,
        contactName: data.contactName,
        phoneNumber: data.phoneNumber,
        email: data.email,
        address: data.address,
        tinNumber: data.tinNumber,
        notes: data.notes,
      },
    });
  }

  // Purchases
  async getPurchases(organizationId: string) {
    return this.prisma.purchase.findMany({
      where: { organizationId },
      include: {
        supplier: true,
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPurchase(organizationId: string, dto: CreatePurchaseDto) {
    const count = await this.prisma.purchase.count({ where: { organizationId } });
    const orderNumber = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    let totalAmount = 0;
    const itemsData = dto.items.map((i) => {
      const lineTotal = i.orderedQty * i.unitCost;
      totalAmount += lineTotal;
      return {
        productId: i.productId,
        orderedQty: i.orderedQty,
        receivedQty: 0,
        unitCost: i.unitCost,
        lineTotal,
      };
    });

    return this.prisma.purchase.create({
      data: {
        organizationId,
        supplierId: dto.supplierId,
        orderNumber,
        status: PurchaseStatus.ORDERED,
        totalAmount,
        notes: dto.notes,
        items: {
          create: itemsData,
        },
      },
      include: {
        supplier: true,
        items: { include: { product: true } },
      },
    });
  }

  async receiveStock(organizationId: string, userId: string, purchaseId: string, dto: ReceiveItemsDto) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, organizationId },
      include: { items: true },
    });

    if (!purchase) {
      throw new NotFoundException('Purchase order not found');
    }

    // Atomic transaction: increment inventory ONLY by received quantities & create movement records
    return this.prisma.$transaction(async (tx) => {
      let allItemsFullyReceived = true;

      for (const receiveItem of dto.receivedItems) {
        const line = purchase.items.find((item) => item.id === receiveItem.purchaseItemId);
        if (!line) continue;

        const additionalQty = receiveItem.receivedQty;
        if (additionalQty <= 0) continue;

        const newReceivedTotal = Number(line.receivedQty) + additionalQty;

        // Update purchase line item
        await tx.purchaseItem.update({
          where: { id: line.id },
          data: { receivedQty: newReceivedTotal },
        });

        // Increment inventory balance
        const currentInv = await tx.inventory.findUnique({
          where: { productId: line.productId },
        });
        const newBalance = Number(currentInv?.quantityOnHand || 0) + additionalQty;

        await tx.inventory.upsert({
          where: { productId: line.productId },
          update: { quantityOnHand: newBalance },
          create: { productId: line.productId, quantityOnHand: newBalance },
        });

        // Record incoming stock movement in ledger
        await tx.inventoryMovement.create({
          data: {
            organizationId,
            productId: line.productId,
            actorUserId: userId,
            type: StockMovementType.PURCHASE_RECEIPT,
            quantity: additionalQty,
            reason: `Purchase Received from ${purchase.orderNumber}`,
            referenceId: purchase.id,
          },
        });

        if (newReceivedTotal < Number(line.orderedQty)) {
          allItemsFullyReceived = false;
        }
      }

      const newStatus = allItemsFullyReceived
        ? PurchaseStatus.RECEIVED
        : PurchaseStatus.PARTIALLY_RECEIVED;

      return tx.purchase.update({
        where: { id: purchaseId },
        data: { status: newStatus },
        include: { items: { include: { product: true } }, supplier: true },
      });
    });
  }
}
