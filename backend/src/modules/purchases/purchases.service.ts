import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseStatus, StockMovementType, Prisma } from '@prisma/client';
import { CreatePurchaseDto, ReceiveItemsDto, CreateSupplierDto, UpdateSupplierDto } from './dto/purchase.dto';

export { CreatePurchaseDto, ReceiveItemsDto, CreateSupplierDto, UpdateSupplierDto };

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // SUPPLIER MANAGEMENT
  // ==========================================

  async getSuppliers(
    organizationId: string,
    options?: { search?: string; includeArchived?: boolean },
  ) {
    const where: any = { organizationId };

    if (!options?.includeArchived) {
      where.isArchived = false;
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    return this.prisma.supplier.findMany({
      where,
      include: {
        _count: {
          select: { purchases: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getSupplierById(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
      include: {
        purchases: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  async createSupplier(organizationId: string, data: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name: data.name.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestException(`Supplier with name "${data.name}" already exists`);
    }

    return this.prisma.supplier.create({
      data: {
        organizationId,
        name: data.name.trim(),
        contactName: data.contactName?.trim() || null,
        phoneNumber: data.phoneNumber?.trim() || null,
        email: data.email?.toLowerCase().trim() || null,
        address: data.address?.trim() || null,
        tinNumber: data.tinNumber?.trim() || null,
        notes: data.notes?.trim() || null,
      },
    });
  }

  async updateSupplier(organizationId: string, id: string, data: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    if (data.name && data.name.trim() !== supplier.name) {
      const existing = await this.prisma.supplier.findFirst({
        where: {
          organizationId,
          name: data.name.trim(),
          id: { not: id },
        },
      });
      if (existing) {
        throw new BadRequestException(`Supplier with name "${data.name}" already exists`);
      }
    }

    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name.trim() : undefined,
        contactName: data.contactName !== undefined ? (data.contactName ? data.contactName.trim() : null) : undefined,
        phoneNumber: data.phoneNumber !== undefined ? (data.phoneNumber ? data.phoneNumber.trim() : null) : undefined,
        email: data.email !== undefined ? (data.email ? data.email.toLowerCase().trim() : null) : undefined,
        address: data.address !== undefined ? (data.address ? data.address.trim() : null) : undefined,
        tinNumber: data.tinNumber !== undefined ? (data.tinNumber ? data.tinNumber.trim() : null) : undefined,
        notes: data.notes !== undefined ? (data.notes ? data.notes.trim() : null) : undefined,
      },
    });
  }

  async archiveSupplier(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return this.prisma.supplier.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  async restoreSupplier(organizationId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, organizationId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return this.prisma.supplier.update({
      where: { id },
      data: { isArchived: false },
    });
  }

  // ==========================================
  // PURCHASE ORDERS & RECEIVING
  // ==========================================

  async getPurchases(
    organizationId: string,
    options?: { supplierId?: string; status?: PurchaseStatus; search?: string },
  ) {
    const where: any = { organizationId };

    if (options?.supplierId) {
      where.supplierId = options.supplierId;
    }

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.search && options.search.trim()) {
      where.orderNumber = { contains: options.search.trim(), mode: 'insensitive' };
    }

    return this.prisma.purchase.findMany({
      where,
      include: {
        supplier: true,
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPurchaseById(organizationId: string, id: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, organizationId },
      include: {
        supplier: true,
        items: {
          include: { product: true },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('Purchase order not found');
    }

    return purchase;
  }

  async createPurchase(organizationId: string, dto: CreatePurchaseDto) {
    // 1. Verify supplier belongs to organization and is active
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, organizationId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found in this organization');
    }

    // 2. Verify all products belong to this organization
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, organizationId },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products were not found in this organization');
    }

    // 3. Sequential order number
    const count = await this.prisma.purchase.count({ where: { organizationId } });
    const orderNumber = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

    // 4. Calculate totals precisely using Prisma Decimal
    let totalAmount = new Prisma.Decimal(0);
    const itemsData = dto.items.map((item) => {
      const unitCost = new Prisma.Decimal(item.unitCost);
      const orderedQty = new Prisma.Decimal(item.orderedQty);
      const lineTotal = unitCost.mul(orderedQty);
      totalAmount = totalAmount.add(lineTotal);

      return {
        productId: item.productId,
        orderedQty,
        receivedQty: new Prisma.Decimal(0),
        unitCost,
        lineTotal,
      };
    });

    // 5. Creating a purchase DOES NOT increase inventory stock.
    // Stock is only increased when goods are received through receiveStock.
    return this.prisma.purchase.create({
      data: {
        organizationId,
        supplierId: dto.supplierId,
        orderNumber,
        status: PurchaseStatus.ORDERED,
        totalAmount,
        notes: dto.notes?.trim() || null,
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

    // Prevent receiving against cancelled or already completed purchases
    if (purchase.status === PurchaseStatus.RECEIVED) {
      throw new BadRequestException('This purchase order has already been fully received');
    }

    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new BadRequestException('Cannot receive items for a cancelled purchase order');
    }

    // Prevent duplicate line item entries in the incoming payload
    const seenLineIds = new Set<string>();
    for (const item of dto.receivedItems) {
      if (seenLineIds.has(item.purchaseItemId)) {
        throw new BadRequestException(
          `Duplicate item in receiving payload for item ID ${item.purchaseItemId}`,
        );
      }
      seenLineIds.add(item.purchaseItemId);
    }

    // Validate quantities before mutating state
    for (const receiveItem of dto.receivedItems) {
      const line = purchase.items.find((item) => item.id === receiveItem.purchaseItemId);
      if (!line) {
        throw new BadRequestException(
          `Line item ${receiveItem.purchaseItemId} does not belong to purchase order ${purchase.orderNumber}`,
        );
      }

      if (receiveItem.receivedQty <= 0) {
        throw new BadRequestException('Received quantity must be greater than zero');
      }

      const currentReceived = Number(line.receivedQty);
      const ordered = Number(line.orderedQty);
      const remaining = ordered - currentReceived;

      if (receiveItem.receivedQty > remaining) {
        throw new BadRequestException(
          `Cannot receive ${receiveItem.receivedQty} units. Only ${remaining} units remaining for item ${line.productId}`,
        );
      }
    }

    // Atomic transaction: increment inventory ONLY by received quantities & create movement records
    return this.prisma.$transaction(async (tx) => {
      for (const receiveItem of dto.receivedItems) {
        const line = purchase.items.find((item) => item.id === receiveItem.purchaseItemId)!;
        const additionalQty = new Prisma.Decimal(receiveItem.receivedQty);
        const newReceivedTotal = new Prisma.Decimal(line.receivedQty).add(additionalQty);

        // 1. Update purchase line item
        await tx.purchaseItem.update({
          where: { id: line.id },
          data: { receivedQty: newReceivedTotal },
        });

        // 2. Increment inventory balance
        const currentInv = await tx.inventory.findUnique({
          where: { productId: line.productId },
        });
        const currentOnHand = currentInv ? new Prisma.Decimal(currentInv.quantityOnHand) : new Prisma.Decimal(0);
        const newBalance = currentOnHand.add(additionalQty);

        await tx.inventory.upsert({
          where: { productId: line.productId },
          update: { quantityOnHand: newBalance },
          create: { productId: line.productId, quantityOnHand: newBalance },
        });

        // 3. Record incoming stock movement in ledger
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
      }

      // Check all items to determine status transition
      const updatedLines = await tx.purchaseItem.findMany({
        where: { purchaseId },
      });

      const allItemsFullyReceived = updatedLines.every((line) => {
        return new Prisma.Decimal(line.receivedQty).gte(new Prisma.Decimal(line.orderedQty));
      });

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
