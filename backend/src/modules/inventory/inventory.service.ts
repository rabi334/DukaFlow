import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StockMovementType } from '@prisma/client';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto';

export { StockAdjustmentDto };

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async getInventoryLevels(organizationId: string) {
    return this.prisma.inventory.findMany({
      where: {
        product: {
          organizationId,
          isArchived: false,
        },
      },
      include: {
        product: {
          include: { category: true },
        },
      },
      orderBy: {
        product: { name: 'asc' },
      },
    });
  }

  async getMovements(organizationId: string, options?: { productId?: string; limit?: number }) {
    const where: any = { organizationId };
    if (options?.productId) {
      where.productId = options.productId;
    }

    return this.prisma.inventoryMovement.findMany({
      where,
      include: {
        product: true,
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
    });
  }

  async adjustStock(organizationId: string, actorUserId: string, dto: StockAdjustmentDto) {
    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException('A reason is mandatory for manual stock adjustments');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, organizationId },
      include: { inventory: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found in this workspace');
    }

    const currentQty = Number(product.inventory?.quantityOnHand || 0);
    const newQty = currentQty + dto.adjustmentQty;

    // Check negative stock rule
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (newQty < 0 && !organization?.allowNegative) {
      throw new BadRequestException(
        `Cannot reduce stock below zero. Current stock is ${currentQty}, attempted reduction is ${Math.abs(dto.adjustmentQty)}`,
      );
    }

    const movementType =
      dto.type ||
      (dto.adjustmentQty > 0
        ? StockMovementType.COUNT_ADJUSTMENT
        : StockMovementType.DAMAGE);

    // Atomic transaction: update balance + log movement
    return this.prisma.$transaction(async (tx) => {
      const updatedInventory = await tx.inventory.upsert({
        where: { productId: dto.productId },
        update: { quantityOnHand: newQty },
        create: { productId: dto.productId, quantityOnHand: newQty },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          organizationId,
          productId: dto.productId,
          actorUserId,
          type: movementType,
          quantity: dto.adjustmentQty,
          reason: dto.reason,
        },
      });

      return {
        inventory: updatedInventory,
        movement,
      };
    });
  }
}
